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

router.get('/reports', requireRole('superuser', 'administrator'), async (_req, res, next) => {
  try {
    const [[totals], [ages], [pathways], [sources], [experience], [daily]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS registrations,COUNT(DISTINCT LOWER(TRIM(email))) AS distinctEmails,
        MIN(DATE(created_at)) AS firstDate,MAX(DATE(created_at)) AS lastDate,
        SUM(status='approved') AS approved,SUM(status='rejected') AS rejected,
        SUM(crisis_experience=1) AS crisisExperience,SUM(newsletter_consent=1) AS informationInterest,
        SUM(attended_info_session=1) AS attended,SUM(attended_info_session=0) AS notAttended,
        SUM(attended_info_session IS NULL) AS attendanceUnknown,
        SUM(attended_info_session=1 AND NULLIF(TRIM(session_feedback),'') IS NOT NULL) AS attendeeFeedback
        FROM applications`),
      pool.query('SELECT age_range AS category,COUNT(*) AS count FROM applications GROUP BY age_range'),
      pool.query('SELECT pathway AS category,COUNT(*) AS count FROM applications GROUP BY pathway'),
      pool.query('SELECT referral_source AS category,COUNT(*) AS count FROM applications GROUP BY referral_source'),
      pool.query('SELECT pathway AS category,SUM(crisis_experience=1) AS experienced,COUNT(*) AS total FROM applications GROUP BY pathway'),
      pool.query('SELECT DATE_FORMAT(created_at,\'%Y-%m-%d\') AS day,COUNT(*) AS count FROM applications GROUP BY DATE(created_at) ORDER BY day')
    ]);
    return res.json({
      scope: 'Inscripciones recibidas; no representan a la población general.',
      totals: { ...totals[0], repeatedEmails: Number(totals[0].registrations) - Number(totals[0].distinctEmails) },
      ages, pathways, sources, experience, daily
    });
  } catch (error) { return next(error); }
});

module.exports = router;
