const express = require('express');
const pool = require('../config/database');
const { requireRole, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const { youtubeUrl, driveUrl, youtubeEmbedUrl, normalizeQuestions, evaluateAnswers, questionForClient } = require('../validation/lesson');
const { courseForManagement: findManageableCourse } = require('../services/course-management');

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
  return findManageableCourse(db, user, courseId);
}

async function replaceLessonQuestions(connection, lessonId, questions) {
  await connection.execute('DELETE FROM lesson_questions WHERE lesson_id=?', [lessonId]);
  for (const question of questions) {
    const [createdQuestion] = await connection.execute(
      'INSERT INTO lesson_questions (lesson_id,question_text,position) VALUES (?,?,?)',
      [lessonId, question.text, question.position]
    );
    for (let index = 0; index < question.options.length; index += 1) {
      await connection.execute(
        'INSERT INTO lesson_question_options (question_id,option_text,position,is_correct) VALUES (?,?,?,?)',
        [createdQuestion.insertId, question.options[index], index + 1, question.correctOption === index + 1]
      );
    }
  }
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

router.patch('/modules/:moduleId', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const title = clean(req.body.title, 180);
    const position = Number(req.body.position);
    if (!Number.isSafeInteger(moduleId) || title.length < 3 || !Number.isInteger(position) || position < 1 || position > 1000) {
      return res.status(422).json({ error: 'Datos del módulo inválidos.' });
    }
    const [modules] = await pool.execute('SELECT course_id AS courseId FROM course_modules WHERE id=? LIMIT 1', [moduleId]);
    if (!modules[0]) return res.status(404).json({ error: 'Módulo no encontrado.' });
    const course = await courseForManagement(req.authUser, modules[0].courseId);
    if (!course) return res.status(404).json({ error: 'Módulo no encontrado.' });
    await withTransaction(async connection => {
      await connection.execute('UPDATE course_modules SET title=?,position=? WHERE id=?', [title, position, moduleId]);
      await audit(req, 'course_module_updated', 'course_module', moduleId, { courseId: modules[0].courseId }, { db: connection, required: true });
    });
    return res.json({ message: 'Módulo actualizado.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un módulo en esa posición.' });
    return next(error);
  }
});

router.post('/modules/:moduleId/lessons', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const title = clean(req.body.title, 180);
    const content = clean(req.body.content, 50000);
    const position = Number(req.body.position);
    const estimatedMinutes = req.body.estimatedMinutes ? Number(req.body.estimatedMinutes) : null;
    const videoUrl = youtubeUrl(req.body.videoUrl);
    const pdfUrl = driveUrl(req.body.pdfUrl);
    const slidesUrl = req.body.slidesUrl ? driveUrl(req.body.slidesUrl) : null;
    const questions = normalizeQuestions(req.body.questions);
    const invalid = !Number.isSafeInteger(moduleId) || title.length < 3 || content.length < 10
      || !Number.isInteger(position) || position < 1
      || (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440))
      || !videoUrl || !pdfUrl || (req.body.slidesUrl && !slidesUrl) || !questions;
    if (invalid) return res.status(422).json({ error: 'Completa la lección, sus enlaces y las seis preguntas con cuatro opciones.' });
    const [modules] = await pool.execute('SELECT course_id FROM course_modules WHERE id=? LIMIT 1', [moduleId]);
    if (!modules[0]) return res.status(404).json({ error: 'Módulo no encontrado.' });
    const course = await courseForManagement(req.authUser, modules[0].course_id);
    if (!course) return res.status(403).json({ error: 'No tienes permiso sobre este curso.' });
    const id = await withTransaction(async connection => {
      const [result] = await connection.execute(
        `INSERT INTO lessons
         (module_id,title,content,position,estimated_minutes,video_url,pdf_url,slides_url)
         VALUES (?,?,?,?,?,?,?,?)`,
        [moduleId, title, content, position, estimatedMinutes, videoUrl, pdfUrl, slidesUrl]
      );
      await replaceLessonQuestions(connection, result.insertId, questions);
      await audit(req, 'lesson_created', 'lesson', result.insertId, { moduleId }, { db: connection, required: true });
      return result.insertId;
    });
    return res.status(201).json({ message: 'Lección creada.', id });
  } catch (error) { return next(error); }
});

router.patch('/lessons/:lessonId', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const title = clean(req.body.title, 180);
    const content = clean(req.body.content, 50000);
    const position = Number(req.body.position);
    const estimatedMinutes = req.body.estimatedMinutes ? Number(req.body.estimatedMinutes) : null;
    const videoUrl = youtubeUrl(req.body.videoUrl);
    const pdfUrl = driveUrl(req.body.pdfUrl);
    const slidesUrl = req.body.slidesUrl ? driveUrl(req.body.slidesUrl) : null;
    const questions = normalizeQuestions(req.body.questions);
    const invalid = !Number.isSafeInteger(lessonId) || title.length < 3 || content.length < 10
      || !Number.isInteger(position) || position < 1
      || (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440))
      || !videoUrl || !pdfUrl || (req.body.slidesUrl && !slidesUrl) || !questions;
    if (invalid) return res.status(422).json({ error: 'Completa la lección, sus enlaces y las seis preguntas con cuatro opciones.' });
    const [lessons] = await pool.execute(
      `SELECT l.module_id AS moduleId,m.course_id AS courseId
       FROM lessons l JOIN course_modules m ON m.id=l.module_id WHERE l.id=? LIMIT 1`,
      [lessonId]
    );
    if (!lessons[0]) return res.status(404).json({ error: 'Lección no encontrada.' });
    const course = await courseForManagement(req.authUser, lessons[0].courseId);
    if (!course) return res.status(404).json({ error: 'Lección no encontrada.' });
    await withTransaction(async connection => {
      await connection.execute(
        `UPDATE lessons SET title=?,content=?,position=?,estimated_minutes=?,
         video_url=?,pdf_url=?,slides_url=? WHERE id=?`,
        [title, content, position, estimatedMinutes, videoUrl, pdfUrl, slidesUrl, lessonId]
      );
      await replaceLessonQuestions(connection, lessonId, questions);
      await audit(req, 'lesson_updated', 'lesson', lessonId, { moduleId: lessons[0].moduleId }, { db: connection, required: true });
    });
    return res.json({ message: 'Lección actualizada.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una lección en esa posición.' });
    return next(error);
  }
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
    const owner = Number(course.creatorId) === Number(req.authUser.id);
    const managing = global || owner;
    let enrollment = null;
    if (req.authUser.role === 'student') {
      const [rows] = await pool.execute("SELECT id,status FROM course_enrollments WHERE course_id=? AND student_id=? AND status IN ('active','completed') LIMIT 1", [courseId, req.authUser.id]);
      enrollment = rows[0] || null;
      if (!enrollment) {
        if (course.status !== 'published') return res.status(404).json({ error: 'Curso no encontrado.' });
        return res.json({ course, enrollment: null, locked: true, modules: [] });
      }
    }
    if (course.status !== 'published' && !global && !owner && !enrollment) return res.status(404).json({ error: 'Curso no encontrado.' });
    const [modules] = await pool.execute('SELECT id,title,position FROM course_modules WHERE course_id=? ORDER BY position', [courseId]);
    const moduleIds = modules.map(module => module.id);
    let lessons = [];
    if (moduleIds.length) {
      const placeholders = moduleIds.map(() => '?').join(',');
      [lessons] = await pool.execute(
        `SELECT id,module_id AS moduleId,title,content,position,
                estimated_minutes AS estimatedMinutes,video_url AS videoUrl,
                pdf_url AS pdfUrl,slides_url AS slidesUrl
         FROM lessons WHERE module_id IN (${placeholders}) ORDER BY module_id,position`,
        moduleIds
      );
    }
    const lessonIds = lessons.map(lesson => lesson.id);
    let questions = [];
    let options = [];
    if (lessonIds.length) {
      const placeholders = lessonIds.map(() => '?').join(',');
      [questions] = await pool.execute(
        `SELECT id,lesson_id AS lessonId,question_text AS text,position
         FROM lesson_questions WHERE lesson_id IN (${placeholders}) ORDER BY lesson_id,position`,
        lessonIds
      );
      const questionIds = questions.map(question => question.id);
      if (questionIds.length) {
        const optionPlaceholders = questionIds.map(() => '?').join(',');
        [options] = await pool.execute(
          `SELECT id,question_id AS questionId,option_text AS text,position,is_correct AS isCorrect
           FROM lesson_question_options WHERE question_id IN (${optionPlaceholders})
           ORDER BY question_id,position`,
          questionIds
        );
      }
    }
    let completedLessonIds = new Set();
    if (enrollment) {
      const [progress] = await pool.execute('SELECT lesson_id AS lessonId FROM lesson_progress WHERE enrollment_id=? AND completed_at IS NOT NULL', [enrollment.id]);
      completedLessonIds = new Set(progress.map(item => item.lessonId));
    }
    const structure = modules.map(module => ({
      ...module,
      lessons: lessons.filter(lesson => lesson.moduleId === module.id).map(lesson => ({
        ...lesson,
        videoEmbedUrl: youtubeEmbedUrl(lesson.videoUrl),
        completed: completedLessonIds.has(lesson.id),
        questions: questions
          .filter(question => question.lessonId === lesson.id)
          .map(question => questionForClient(question, options, managing))
      }))
    }));
    return res.json({ course, enrollment, locked: false, modules: structure });
  } catch (error) { return next(error); }
});

router.patch('/lessons/:lessonId/progress', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isSafeInteger(lessonId)) return res.status(422).json({ error: 'Lección inválida.' });
    const [rows] = await pool.execute(
      `SELECT e.id AS enrollmentId FROM course_enrollments e
       JOIN course_modules m ON m.course_id=e.course_id JOIN lessons l ON l.module_id=m.id
       WHERE e.student_id=? AND e.status IN ('active','completed') AND l.id=? LIMIT 1`,
      [req.authUser.id, lessonId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lección no disponible.' });
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    if (answers.length !== 6) return res.status(422).json({ error: 'Responde las seis preguntas antes de completar la lección.' });
    const [correctOptions] = await pool.execute(
      `SELECT q.id AS questionId,o.id AS optionId,q.position
       FROM lesson_questions q
       JOIN lesson_question_options o ON o.question_id=q.id AND o.is_correct=TRUE
       WHERE q.lesson_id=? ORDER BY q.position`,
      [lessonId]
    );
    if (correctOptions.length !== 6) return res.status(409).json({ error: 'La comprobación de esta lección todavía no está configurada.' });
    const incorrectQuestions = evaluateAnswers(correctOptions, answers);
    if (!incorrectQuestions) return res.status(422).json({ error: 'Las respuestas enviadas no son válidas.' });
    if (incorrectQuestions.length) {
      return res.status(422).json({
        error: 'Revisa tus respuestas: aún no todas son correctas.',
        incorrectQuestions
      });
    }
    await withTransaction(async connection => {
      await connection.execute(
        `INSERT INTO lesson_progress (enrollment_id,lesson_id,completed_at) VALUES (?,?,UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE completed_at=VALUES(completed_at)`,
        [rows[0].enrollmentId, lessonId]
      );
      const [[totals]] = await connection.execute(
        `SELECT COUNT(l.id) AS totalLessons,
                COUNT(CASE WHEN lp.completed_at IS NOT NULL THEN 1 END) AS completedLessons
         FROM course_enrollments e
         JOIN course_modules m ON m.course_id=e.course_id
         JOIN lessons l ON l.module_id=m.id
         LEFT JOIN lesson_progress lp ON lp.enrollment_id=e.id AND lp.lesson_id=l.id
         WHERE e.id=?`,
        [rows[0].enrollmentId]
      );
      if (Number(totals.totalLessons) > 0 && Number(totals.totalLessons) === Number(totals.completedLessons)) {
        await connection.execute(
          "UPDATE course_enrollments SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?",
          [rows[0].enrollmentId]
        );
      } else {
        await connection.execute(
          "UPDATE course_enrollments SET status='active',completed_at=NULL WHERE id=?",
          [rows[0].enrollmentId]
        );
      }
      await audit(req, 'lesson_progress_updated', 'lesson', lessonId, { completed: true }, { db: connection, required: true });
    });
    return res.json({ message: '¡Todas las respuestas son correctas! Lección completada.', completed: true });
  } catch (error) { return next(error); }
});

module.exports = router;
