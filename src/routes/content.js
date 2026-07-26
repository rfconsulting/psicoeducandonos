const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireCapability, verifyCsrf } = require('../middleware/security');
const audit = require('../services/audit');
const withTransaction = require('../services/transaction');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const contentRepository = require('../repositories/content-repository');
const { pagination, page } = require('../utils/pagination');
const { normalizeCoursePayload, courseForManagement } = require('../services/course-management');

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
      `SELECT a.id,a.author_id AS authorId,a.title,a.slug,a.summary,a.body,a.status,a.published_at AS publishedAt,u.full_name AS author
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
    const status = req.body.status === 'published' ? 'published' : 'draft';
    if (title.length < 5 || summary.length < 10 || body.length < 30) return res.status(422).json({ error: 'Completa el título, el resumen y el contenido del artículo.' });
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO articles (author_id,title,slug,summary,body,status,published_at) VALUES (?,?,?,?,?,?,?)', [req.session.user.id, title, slug, summary, body, status, status === 'published' ? new Date() : null]);
      await audit(req, 'article_created', 'article', result.insertId, { status }, { db: connection, required: true });
      return result.insertId;
    });
    res.status(201).json({ message: 'Artículo creado.', id });
  } catch (error) { next(error); }
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
    const result = page(courses, paging.limit);
    res.json({ courses: result.items, nextCursor: result.nextCursor });
  } catch (error) { next(error); }
});

router.post('/courses', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const title = text(req.body.title, 180);
    const description = text(req.body.description, 10000);
    const status = req.body.status === 'published' ? 'published' : 'draft';
    if (title.length < 5 || description.length < 20) return res.status(422).json({ error: 'Completa el título y la descripción del curso.' });
    const slug = `${slugify(title)}-${Date.now().toString(36)}`;
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO courses (creator_id,title,slug,description,status,published_at) VALUES (?,?,?,?,?,?)', [req.session.user.id, title, slug, description, status, status === 'published' ? new Date() : null]);
      await audit(req, 'course_created', 'course', result.insertId, { status }, { db: connection, required: true });
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
        `UPDATE courses SET title=?,description=?,status=?,
         published_at=IF(?='published',COALESCE(published_at,UTC_TIMESTAMP()),NULL)
         WHERE id=?`,
        [payload.title, payload.description, payload.status, payload.status, courseId]
      );
      await audit(req, 'course_updated', 'course', courseId, { status: payload.status }, { db: connection, required: true });
    });
    return res.json({ message: 'Curso actualizado.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
