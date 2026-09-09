const AREAS = Object.freeze(['supervision', 'practice', 'personal_work']);

function questionPayload(body = {}) {
  const questions = body.questions || {};
  const result = {};
  for (const area of AREAS) {
    const text = String(questions[area] || '').trim();
    if (text.length < 5 || text.length > 2000) return null;
    result[area] = text;
  }
  return result;
}

function answerPayload(body = {}) {
  const area = String(body.area || '');
  const answer = String(body.answer || '').trim();
  if (!AREAS.includes(area) || answer.length < 3 || answer.length > 10000) return null;
  return { area, answer };
}

function reviewPayload(body = {}) {
  const areas = body.areas || {};
  const result = {};
  for (const area of AREAS) {
    const value = areas[area] || {};
    const observation = String(value.observation || '').trim();
    if (observation.length > 5000) return null;
    result[area] = { certified: value.certified === true, observation };
  }
  return result;
}

async function refreshEnrollmentCompletion(db, enrollmentId) {
  const [[totals]] = await db.execute(`SELECT
    (SELECT COUNT(*) FROM lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.course_id=e.course_id) AS totalLessons,
    (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id JOIN course_modules m ON m.id=l.module_id WHERE lp.enrollment_id=e.id AND lp.completed_at IS NOT NULL AND m.course_id=e.course_id) AS completedLessons,
    (SELECT COUNT(DISTINCT q.module_id) FROM module_certification_questions q JOIN course_modules m ON m.id=q.module_id WHERE m.course_id=e.course_id) AS configuredModules,
    (SELECT COUNT(*) FROM course_modules m WHERE m.course_id=e.course_id AND
      (SELECT COUNT(*) FROM module_certification_questions q WHERE q.module_id=m.id AND q.published=TRUE)=3 AND
      (SELECT COUNT(*) FROM module_certification_records r WHERE r.enrollment_id=e.id AND r.module_id=m.id AND r.certified=TRUE)=3) AS approvedModules
    FROM course_enrollments e WHERE e.id=?`, [enrollmentId]);
  const lessonsComplete = Number(totals.totalLessons) > 0 && Number(totals.totalLessons) === Number(totals.completedLessons);
  const certificationComplete = Number(totals.configuredModules) === 0 || Number(totals.configuredModules) === Number(totals.approvedModules);
  await db.execute(
    lessonsComplete && certificationComplete
      ? "UPDATE course_enrollments SET status='completed',completed_at=COALESCE(completed_at,UTC_TIMESTAMP()) WHERE id=?"
      : "UPDATE course_enrollments SET status='active',completed_at=NULL WHERE id=?",
    [enrollmentId]
  );
  return { lessonsComplete, certificationComplete };
}

module.exports = { AREAS, questionPayload, answerPayload, reviewPayload, refreshEnrollmentCompletion };
