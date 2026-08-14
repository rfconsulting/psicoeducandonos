const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireCapability, verifyCsrf } = require('../middleware/security');
const audit = require('../services/audit');
const withTransaction = require('../services/transaction');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const contentRepository = require('../repositories/content-repository');
const { pagination, page } = require('../utils/pagination');
const { normalizeCoursePayload, courseForManagement } = require('../services/course-management');
const { catalogAvailability } = require('../services/course-enrollment');
const env = require('../config/env');
const { driveDownloadUrl } = require('../validation/lesson');

const router = express.Router();
function text(value, max) { return String(value || '').trim().slice(0, max); }
function slugify(value) {
  return text(value, 180).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
}

router.get('/articles', requireAuth, async (req, res, next) => {
  try {
    const role = req.session.user.role;
    const paging = pagination(req.query);
    const articles = await contentRepository.listArticles({
      userId: req.session.user.id,
      globalAccess: hasCapability(role, CAPABILITIES.ARTICLE_MANAGE_ALL),
      canAuthor: hasCapability(role, CAPABILITIES.ARTICLE_CREATE),
      ...paging
    });
    const result = page(articles, paging.limit);
    res.json({ articles: result.items, nextCursor: result.nextCursor });
  } catch (error) { next(error); }
});

router.get('/articles/:slug', requireAuth, async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 200);
    const [rows] = await pool.execute(
      `SELECT a.id,a.author_id AS authorId,a.title,a.slug,a.summary,a.body,a.pdf_url AS pdfUrl,a.status,a.published_at AS publishedAt,u.full_name AS author
       FROM articles a JOIN users u ON u.id=a.author_id WHERE a.slug=? LIMIT 1`,
      [slug]
    );
    const article = rows[0];
    if (!article) return res.status(404).json({ error: 'Artículo no encontrado.' });
    const allowed = article.status === 'published' || ['superuser','administrator'].includes(req.session.user.role) || article.authorId === req.session.user.id;
    if (!allowed) return res.status(404).json({ error: 'Artículo no encontrado.' });
    return res.json({ article });
  } catch (error) { return next(error); }
});

router.post('/articles', requireCapability(CAPABILITIES.ARTICLE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const title = text(req.body.title, 180);
    const summary = text(req.body.summary, 320);
    const body = text(req.body.body, 50000);
    const pdfUrl = req.body.pdfUrl ? driveDownloadUrl(req.body.pdfUrl) : null;
    const status = req.body.status === 'published' ? 'published' : 'draft';
    if (title.length < 5 || summary.length < 10 || body.length < 30 || (req.body.pdfUrl && !pdfUrl)) return res.status(422).json({ error: 'Completa el artículo y utiliza un enlace válido de Google Drive para el PDF.' });
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO articles (author_id,title,slug,summary,body,pdf_url,status,published_at) VALUES (?,?,?,?,?,?,?,?)', [req.session.user.id, title, slug, summary, body, pdfUrl, status, status === 'published' ? new Date() : null]);
      await audit(req, 'article_created', 'article', result.insertId, { status }, { db: connection, required: true });
      return result.insertId;
    });
    res.status(201).json({ message: 'Artículo creado.', id });
  } catch (error) { next(error); }
});

router.patch('/articles/:id', requireCapability(CAPABILITIES.ARTICLE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const articleId = Number(req.params.id); const title = text(req.body.title, 180); const summary = text(req.body.summary, 320); const body = text(req.body.body, 50000);
    const status = req.body.status === 'published' ? 'published' : 'draft'; const pdfUrl = req.body.pdfUrl ? driveDownloadUrl(req.body.pdfUrl) : null;
    if (!Number.isSafeInteger(articleId) || title.length < 5 || summary.length < 10 || body.length < 30 || (req.body.pdfUrl && !pdfUrl)) return res.status(422).json({ error: 'Completa el artículo y utiliza un enlace válido de Google Drive para el PDF.' });
    const [[article]] = await pool.execute('SELECT id,author_id AS authorId FROM articles WHERE id=? LIMIT 1', [articleId]);
    const global = hasCapability(req.authUser.role, CAPABILITIES.ARTICLE_MANAGE_ALL);
    if (!article || (!global && Number(article.authorId) !== Number(req.authUser.id))) return res.status(404).json({ error: 'Artículo no encontrado.' });
    await withTransaction(async connection => {
      await connection.execute('UPDATE articles SET title=?,summary=?,body=?,pdf_url=?,status=?,published_at=IF(?,COALESCE(published_at,UTC_TIMESTAMP()),NULL) WHERE id=?', [title, summary, body, pdfUrl, status, status === 'published' ? 1 : 0, articleId]);
      await audit(req, 'article_updated', 'article', articleId, { status, hasPdf: Boolean(pdfUrl) }, { db: connection, required: true });
    });
    return res.json({ message: 'Artículo actualizado.' });
  } catch (error) { return next(error); }
});

router.get('/courses', requireAuth, async (req, res, next) => {
  try {
    const role = req.session.user.role;
    const paging = pagination(req.query);
    const courses = await contentRepository.listCourses({
      userId: req.session.user.id,
      globalAccess: hasCapability(role, CAPABILITIES.COURSE_MANAGE_ALL),
      canCreate: hasCapability(role, CAPABILITIES.COURSE_CREATE),
      ...paging
    });
    const courseIds = courses.map(course => course.id);
    if (courseIds.length) {
      const placeholders = courseIds.map(() => '?').join(',');
      const [prices] = await pool.execute(`SELECT p.course_id AS courseId,pp.id,pp.currency,pp.amount_minor AS amountMinor FROM products p JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE WHERE p.active=TRUE AND p.course_id IN (${placeholders}) ORDER BY pp.id DESC`, courseIds);
      courses.forEach(course => { course.prices = prices.filter(price => Number(price.courseId) === Number(course.id)).map(({ courseId: _courseId, ...price }) => price); });
    } else courses.forEach(course => { course.prices = []; });
    if (role === 'student') {
      const [[profile]] = await pool.execute('SELECT review_status AS reviewStatus FROM student_profiles WHERE user_id=? LIMIT 1', [req.session.user.id]);
      const [enrollments] = await pool.execute("SELECT course_id AS courseId FROM course_enrollments WHERE student_id=? AND status IN ('active','completed')", [req.session.user.id]);
      const enrolledIds = new Set(enrollments.map(item => Number(item.courseId)));
      courses.forEach(course => {
        course.availability = catalogAvailability(course, {
          approved: profile?.reviewStatus === 'approved',
          enrolled: enrolledIds.has(Number(course.id)),
          paymentsEnabled: env.paymentProvider !== 'disabled'
        });
      });
    }
    const result = page(courses, paging.limit);
    res.json({ courses: result.items, nextCursor: result.nextCursor });
  } catch (error) { next(error); }
});

router.post('/courses', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const payload = normalizeCoursePayload(req.body);
    if (!payload) return res.status(422).json({ error: 'Completa el título y la descripción del curso.' });
    const slug = `${slugify(payload.title)}-${Date.now().toString(36)}`;
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO courses (creator_id,title,slug,description,status,access_type,enrollment_policy,published_at) VALUES (?,?,?,?,?,?,?,?)', [req.session.user.id, payload.title, slug, payload.description, payload.status, payload.accessType, payload.enrollmentPolicy, payload.status === 'published' ? new Date() : null]);
      await audit(req, 'course_created', 'course', result.insertId, { status: payload.status, accessType: payload.accessType, enrollmentPolicy: payload.enrollmentPolicy }, { db: connection, required: true });
      return result.insertId;
    });
    res.status(201).json({ message: 'Curso creado.', id });
  } catch (error) { next(error); }
});

router.patch('/courses/:id', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.id);
    const payload = normalizeCoursePayload(req.body);
    if (!Number.isSafeInteger(courseId) || courseId < 1 || !payload) {
      return res.status(422).json({ error: 'Completa el título y la descripción del curso.' });
    }
    const course = await courseForManagement(pool, req.authUser, courseId);
    if (!course) return res.status(404).json({ error: 'Curso no encontrado.' });
    await withTransaction(async connection => {
      await connection.execute(
        `UPDATE courses SET title=?,description=?,status=?,access_type=?,enrollment_policy=?,
         published_at=IF(?,COALESCE(published_at,UTC_TIMESTAMP()),NULL)
         WHERE id=?`,
        [payload.title, payload.description, payload.status, payload.accessType, payload.enrollmentPolicy, payload.status === 'published' ? 1 : 0, courseId]
      );
      await audit(req, 'course_updated', 'course', courseId, { status: payload.status, accessType: payload.accessType, enrollmentPolicy: payload.enrollmentPolicy }, { db: connection, required: true });
    });
    return res.json({ message: 'Curso actualizado.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
