const express = require('express');
const pool = require('../config/database');
const { requireRole } = require('../middleware/security');

const router = express.Router();

router.get('/statistics', requireRole('superuser', 'administrator'), async (_req, res, next) => {
  try {
    const [[totals], [courses]] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT student_id) FROM course_enrollments
           WHERE status IN ('active','completed')) AS enrolledStudents,
          (SELECT COUNT(*) FROM applications WHERE status='pending') AS pendingApplications,
          (SELECT COUNT(*) FROM courses) AS coursesCreated,
          (SELECT COUNT(*) FROM articles) AS articlesCreated,
          (SELECT COUNT(*) FROM users WHERE role='teacher') AS teachers,
          (SELECT COUNT(*) FROM users WHERE role='writer') AS writers
      `),
      pool.query(`
        SELECT c.id,c.title,c.status,
          COUNT(DISTINCT CASE WHEN ce.status IN ('active','completed') THEN ce.student_id END) AS enrolledStudents
        FROM courses c
        LEFT JOIN course_enrollments ce ON ce.course_id=c.id
        GROUP BY c.id,c.title,c.status
        ORDER BY enrolledStudents DESC,c.id DESC
      `)
    ]);
    return res.json({ totals: totals[0], courses });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
