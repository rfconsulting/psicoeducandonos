const { CAPABILITIES, hasCapability } = require('../constants/access');

function hasGlobalStudentScope(actor) {
  return hasCapability(actor.role, CAPABILITIES.COURSE_MANAGE_ALL);
}

async function canAccessStudentTracking(db, actor, studentId) {
  const globalScope = hasGlobalStudentScope(actor);
  const sql = globalScope
    ? "SELECT id FROM users WHERE id=? AND role='student' LIMIT 1"
    : `SELECT u.id FROM users u
       WHERE u.id=? AND u.role='student' AND EXISTS (
         SELECT 1 FROM course_enrollments ce
         JOIN courses c ON c.id=ce.course_id
         WHERE ce.student_id=u.id AND c.creator_id=?
       ) LIMIT 1`;
  const values = globalScope ? [studentId] : [studentId, actor.id];
  const [rows] = await db.execute(sql, values);
  return rows.length > 0;
}

async function listEnrollmentCandidates(db, actor) {
  if (hasGlobalStudentScope(actor)) {
    const [rows] = await db.execute(
      "SELECT id,full_name AS fullName FROM users WHERE role='student' AND status='active' ORDER BY full_name LIMIT 500"
    );
    return rows;
  }
  const [rows] = await db.execute(
    `SELECT DISTINCT u.id,u.full_name AS fullName
     FROM users u
     JOIN course_enrollments ce ON ce.student_id=u.id
     JOIN courses c ON c.id=ce.course_id
     WHERE u.role='student' AND u.status='active' AND c.creator_id=?
     ORDER BY u.full_name LIMIT 500`,
    [actor.id]
  );
  return rows;
}

module.exports = { hasGlobalStudentScope, canAccessStudentTracking, listEnrollmentCandidates };
