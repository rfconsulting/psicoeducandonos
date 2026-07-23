const express = require('express');
const pool = require('../config/database');
const { requireRole, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');

const router = express.Router();
const clean = (value, max) => String(value || '').trim().slice(0, max);

router.get('/enrollments/my', requireRole('student'), async (req, res, next) => {
  try {
    const [courses] = await pool.execute(
      `SELECT c.id,c.title,c.slug,c.description,u.full_name AS creator,
              e.status AS enrollmentStatus,e.enrolled_at AS enrolledAt,
              COUNT(l.id) AS lessonCount,
              COUNT(CASE WHEN lp.completed_at IS NOT NULL THEN 1 END) AS completedLessons
       FROM course_enrollments e
       JOIN courses c ON c.id=e.course_id
       JOIN users u ON u.id=c.creator_id
       LEFT JOIN course_modules m ON m.course_id=c.id
       LEFT JOIN lessons l ON l.module_id=m.id
       LEFT JOIN lesson_progress lp ON lp.enrollment_id=e.id AND lp.lesson_id=l.id
       WHERE e.student_id=? AND e.status IN ('active','completed')
       GROUP BY c.id,c.title,c.slug,c.description,u.full_name,e.status,e.enrolled_at
       ORDER BY e.enrolled_at DESC`,
      [req.authUser.id]
    );
    return res.json({ courses });
  } catch (error) { return next(error); }
});

async function courseForManagement(user, courseId, db = pool) {
  const [rows] = await db.execute('SELECT id,creator_id,status FROM courses WHERE id=? LIMIT 1', [courseId]);
  const course = rows[0];
  if (!course) return null;
  const global = hasCapability(user.role, CAPABILITIES.COURSE_MANAGE_ALL);
  return global || course.creator_id === user.id ? course : false;
}

router.post('/courses/:courseId/modules', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const title = clean(req.body.title, 180);
    const position = Number(req.body.position);
    if (!Number.isSafeInteger(courseId) || title.length < 3 || !Number.isInteger(position) || position < 1 || position > 1000) return res.status(422).json({ error: 'Datos del módulo inválidos.' });
    const course = await courseForManagement(req.authUser, courseId);
    if (!course) return res.status(course === null ? 404 : 403).json({ error: 'Curso no encontrado o sin permiso.' });
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO course_modules (course_id,title,position) VALUES (?,?,?)', [courseId, title, position]);
      await audit(req, 'course_module_created', 'course_module', result.insertId, { courseId }, { db: connection, required: true });
      return result.insertId;
    });
    return res.status(201).json({ message: 'Módulo creado.', id });
  } catch (error) { return next(error); }
});

router.post('/modules/:moduleId/lessons', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const title = clean(req.body.title, 180);
    const content = clean(req.body.content, 50000);
    const position = Number(req.body.position);
    const estimatedMinutes = req.body.estimatedMinutes ? Number(req.body.estimatedMinutes) : null;
    if (!Number.isSafeInteger(moduleId) || title.length < 3 || content.length < 10 || !Number.isInteger(position) || position < 1 || (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440))) return res.status(422).json({ error: 'Datos de la lección inválidos.' });
    const [modules] = await pool.execute('SELECT course_id FROM course_modules WHERE id=? LIMIT 1', [moduleId]);
    if (!modules[0]) return res.status(404).json({ error: 'Módulo no encontrado.' });
    const course = await courseForManagement(req.authUser, modules[0].course_id);
    if (!course) return res.status(403).json({ error: 'No tienes permiso sobre este curso.' });
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute('INSERT INTO lessons (module_id,title,content,position,estimated_minutes) VALUES (?,?,?,?,?)', [moduleId, title, content, position, estimatedMinutes]);
      await audit(req, 'lesson_created', 'lesson', result.insertId, { moduleId }, { db: connection, required: true });
      return result.insertId;
    });
    return res.status(201).json({ message: 'Lección creada.', id });
  } catch (error) { return next(error); }
});

router.post('/courses/:courseId/enrollments', requireCapability(CAPABILITIES.COURSE_ENROLL), verifyCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const studentId = Number(req.body.studentId);
    if (!Number.isSafeInteger(courseId) || !Number.isSafeInteger(studentId)) return res.status(422).json({ error: 'Curso o estudiante inválido.' });
    const course = await courseForManagement(req.authUser, courseId);
    if (!course) return res.status(course === null ? 404 : 403).json({ error: 'Curso no encontrado o sin permiso.' });
    const [students] = await pool.execute("SELECT id FROM users WHERE id=? AND role='student' AND status='active' LIMIT 1", [studentId]);
    if (!students[0]) return res.status(404).json({ error: 'Estudiante activo no encontrado.' });
    await withTransaction(async connection => {
      await connection.execute(
        `INSERT INTO course_enrollments (course_id,student_id,enrolled_by) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE status='active',enrolled_by=VALUES(enrolled_by),completed_at=NULL`,
        [courseId, studentId, req.authUser.id]
      );
      await audit(req, 'student_enrolled', 'course', courseId, { studentId }, { db: connection, required: true });
    });
    return res.json({ message: 'Estudiante inscrito.' });
  } catch (error) { return next(error); }
});

router.get('/courses/:courseId/structure', requireCapability(CAPABILITIES.LEARNING_ACCESS), async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isSafeInteger(courseId)) return res.status(422).json({ error: 'Curso inválido.' });
    const [courses] = await pool.execute('SELECT id,title,description,status,creator_id AS creatorId FROM courses WHERE id=? LIMIT 1', [courseId]);
    const course = courses[0];
    if (!course) return res.status(404).json({ error: 'Curso no encontrado.' });
    const global = hasCapability(req.authUser.role, CAPABILITIES.COURSE_MANAGE_ALL);
    const owner = course.creatorId === req.authUser.id;
    let enrollment = null;
    if (req.authUser.role === 'student') {
      const [rows] = await pool.execute("SELECT id,status FROM course_enrollments WHERE course_id=? AND student_id=? AND status IN ('active','completed') LIMIT 1", [courseId, req.authUser.id]);
      enrollment = rows[0] || null;
    }
    if (course.status !== 'published' && !global && !owner && !enrollment) return res.status(404).json({ error: 'Curso no encontrado.' });
    const [modules] = await pool.execute('SELECT id,title,position FROM course_modules WHERE course_id=? ORDER BY position', [courseId]);
    const moduleIds = modules.map(module => module.id);
    let lessons = [];
    if (moduleIds.length) {
      const placeholders = moduleIds.map(() => '?').join(',');
      [lessons] = await pool.execute(`SELECT id,module_id AS moduleId,title,content,position,estimated_minutes AS estimatedMinutes FROM lessons WHERE module_id IN (${placeholders}) ORDER BY module_id,position`, moduleIds);
    }
    let completedLessonIds = new Set();
    if (enrollment) {
      const [progress] = await pool.execute('SELECT lesson_id AS lessonId FROM lesson_progress WHERE enrollment_id=? AND completed_at IS NOT NULL', [enrollment.id]);
      completedLessonIds = new Set(progress.map(item => item.lessonId));
    }
    const structure = modules.map(module => ({
      ...module,
      lessons: lessons.filter(lesson => lesson.moduleId === module.id).map(lesson => ({ ...lesson, completed: completedLessonIds.has(lesson.id) }))
    }));
    return res.json({ course, enrollment, modules: structure });
  } catch (error) { return next(error); }
});

router.patch('/lessons/:lessonId/progress', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const completed = req.body.completed === true;
    if (!Number.isSafeInteger(lessonId)) return res.status(422).json({ error: 'Lección inválida.' });
    const [rows] = await pool.execute(
      `SELECT e.id AS enrollmentId FROM course_enrollments e
       JOIN course_modules m ON m.course_id=e.course_id JOIN lessons l ON l.module_id=m.id
       WHERE e.student_id=? AND e.status='active' AND l.id=? LIMIT 1`,
      [req.authUser.id, lessonId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lección no disponible.' });
    await withTransaction(async connection => {
      await connection.execute(
        `INSERT INTO lesson_progress (enrollment_id,lesson_id,completed_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE completed_at=VALUES(completed_at)`,
        [rows[0].enrollmentId, lessonId, completed ? new Date() : null]
      );
      await audit(req, 'lesson_progress_updated', 'lesson', lessonId, { completed }, { db: connection, required: true });
    });
    return res.json({ message: 'Progreso actualizado.' });
  } catch (error) { return next(error); }
});

module.exports = router;
