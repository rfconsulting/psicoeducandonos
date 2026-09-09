const express = require('express');
const pool = require('../config/database');
const { requireRole, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const { courseForManagement } = require('../services/course-management');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const { AREAS, questionPayload, answerPayload, reviewPayload, refreshEnrollmentCompletion } = require('../services/module-certification');

const router = express.Router();

router.put('/modules/:moduleId/questions', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const questions = questionPayload(req.body);
    if (!Number.isSafeInteger(moduleId) || moduleId < 1 || !questions) return res.status(422).json({ error: 'Debes escribir las tres preguntas de certificación.' });
    const [[module]] = await pool.execute('SELECT course_id AS courseId FROM course_modules WHERE id=? LIMIT 1', [moduleId]);
    if (!module) return res.status(404).json({ error: 'Módulo no encontrado.' });
    const course = await courseForManagement(pool, req.authUser, module.courseId);
    if (!course) return res.status(403).json({ error: 'No tienes permiso sobre este módulo.' });
    const [currentQuestions] = await pool.execute('SELECT area,question_text AS question FROM module_certification_questions WHERE module_id=?', [moduleId]);
    const [[usage]] = await pool.execute(`SELECT COUNT(*) AS total FROM module_certification_records r
      JOIN module_certification_questions q ON q.id=r.question_id WHERE q.module_id=?`, [moduleId]);
    const changed = currentQuestions.length !== 3 || currentQuestions.some(item => item.question !== questions[item.area]);
    if (Number(usage.total) > 0 && changed) return res.status(409).json({ error: 'Las preguntas ya tienen respuestas y no pueden modificarse.' });
    if (!changed) return res.json({ message: 'Las preguntas ya están publicadas.' });
    await withTransaction(async connection => {
      for (const area of AREAS) {
        await connection.execute(`INSERT INTO module_certification_questions (module_id,area,question_text,published,created_by)
          VALUES (?,?,?,TRUE,?) ON DUPLICATE KEY UPDATE question_text=VALUES(question_text),published=TRUE`, [moduleId, area, questions[area], req.authUser.id]);
      }
      const [enrollments] = await connection.execute('SELECT id FROM course_enrollments WHERE course_id=? AND status IN (\'active\',\'completed\')', [module.courseId]);
      for (const enrollment of enrollments) await refreshEnrollmentCompletion(connection, enrollment.id);
      await audit(req, 'module_certification_questions_published', 'course_module', moduleId, { areas: AREAS }, { db: connection, required: true });
    });
    return res.json({ message: 'Preguntas de certificación publicadas.' });
  } catch (error) { return next(error); }
});

router.patch('/modules/:moduleId/answer', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const payload = answerPayload(req.body);
    if (!Number.isSafeInteger(moduleId) || !payload) return res.status(422).json({ error: 'Respuesta inválida.' });
    const [[context]] = await pool.execute(`SELECT e.id AS enrollmentId,q.id AS questionId
      FROM course_modules m JOIN course_enrollments e ON e.course_id=m.course_id
      JOIN module_certification_questions q ON q.module_id=m.id AND q.area=? AND q.published=TRUE
      WHERE m.id=? AND e.student_id=? AND e.status IN ('active','completed') LIMIT 1`, [payload.area, moduleId, req.authUser.id]);
    if (!context) return res.status(404).json({ error: 'Pregunta no disponible.' });
    await withTransaction(async connection => {
      await connection.execute(`INSERT INTO module_certification_records
        (enrollment_id,module_id,area,question_id,answer_text,answer_status,submitted_at)
        VALUES (?,?,?,?,?,'submitted',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE
        question_id=VALUES(question_id),answer_text=VALUES(answer_text),answer_status='submitted',submitted_at=UTC_TIMESTAMP(),certified=FALSE,reviewed_by=NULL,reviewed_at=NULL`,
      [context.enrollmentId, moduleId, payload.area, context.questionId, payload.answer]);
      await refreshEnrollmentCompletion(connection, context.enrollmentId);
      await audit(req, 'module_certification_answer_submitted', 'course_module', moduleId, { area: payload.area }, { db: connection, required: true });
    });
    return res.json({ message: 'Respuesta enviada al profesor.' });
  } catch (error) { return next(error); }
});

router.patch('/enrollments/:enrollmentId/modules/:moduleId/review', requireCapability(CAPABILITIES.STUDENT_TRACK), verifyCsrf, async (req, res, next) => {
  try {
    const enrollmentId = Number(req.params.enrollmentId);
    const moduleId = Number(req.params.moduleId);
    const payload = reviewPayload(req.body);
    if (!Number.isSafeInteger(enrollmentId) || !Number.isSafeInteger(moduleId) || !payload) return res.status(422).json({ error: 'Revisión inválida.' });
    const global = hasCapability(req.authUser.role, CAPABILITIES.COURSE_MANAGE_ALL);
    const [[context]] = await pool.execute(`SELECT e.id FROM course_enrollments e JOIN course_modules m ON m.course_id=e.course_id JOIN courses c ON c.id=e.course_id
      WHERE e.id=? AND m.id=?${global ? '' : ' AND c.creator_id=?'} LIMIT 1`, global ? [enrollmentId, moduleId] : [enrollmentId, moduleId, req.authUser.id]);
    if (!context) return res.status(404).json({ error: 'Módulo o matrícula fuera de tu alcance.' });
    await withTransaction(async connection => {
      for (const area of AREAS) {
        const [[record]] = await connection.execute('SELECT answer_text AS answer FROM module_certification_records WHERE enrollment_id=? AND module_id=? AND area=? FOR UPDATE', [enrollmentId, moduleId, area]);
        if (!record?.answer) continue;
        const review = payload[area];
        await connection.execute(`UPDATE module_certification_records SET certified=?,teacher_observation=?,
          answer_status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE enrollment_id=? AND module_id=? AND area=?`,
        [review.certified, review.observation, review.certified ? 'reviewed' : 'changes_requested', req.authUser.id, enrollmentId, moduleId, area]);
      }
      await refreshEnrollmentCompletion(connection, enrollmentId);
      await audit(req, 'module_certification_reviewed', 'course_module', moduleId, { enrollmentId }, { db: connection, required: true });
    });
    return res.json({ message: 'Certificación del módulo actualizada.' });
  } catch (error) { return next(error); }
});

router.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT e.id AS enrollmentId,c.id AS courseId,c.title AS courseTitle,
      m.id AS moduleId,m.title AS moduleTitle,m.position,q.id AS questionId,q.area,q.question_text AS question,
      COALESCE(r.answer_text,'') AS answer,COALESCE(r.answer_status,'pending') AS answerStatus,
      COALESCE(r.certified,FALSE) AS certified,COALESCE(r.teacher_observation,'') AS observation,r.reviewed_at AS reviewedAt
      FROM course_enrollments e JOIN courses c ON c.id=e.course_id JOIN course_modules m ON m.course_id=c.id
      JOIN module_certification_questions q ON q.module_id=m.id AND q.published=TRUE
      LEFT JOIN module_certification_records r ON r.enrollment_id=e.id AND r.module_id=m.id AND r.area=q.area
      WHERE e.student_id=? AND e.status IN ('active','completed') ORDER BY e.enrolled_at DESC,m.position,FIELD(q.area,'supervision','practice','personal_work')`, [req.authUser.id]);
    return res.json({ certifications: rows.map(row => ({ ...row, certified: Boolean(row.certified) })) });
  } catch (error) { return next(error); }
});

module.exports = router;
