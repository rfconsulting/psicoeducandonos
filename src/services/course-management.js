const { CAPABILITIES, hasCapability } = require('../constants/access');

function normalizeCoursePayload(body = {}) {
  const title = String(body.title || '').trim().slice(0, 180);
  const description = String(body.description || '').trim().slice(0, 10000);
  const status = body.status === 'published' ? 'published' : 'draft';
  if (title.length < 5 || description.length < 20) return null;
  return { title, description, status };
}

async function courseForManagement(db, actor, courseId) {
  const [rows] = await db.execute(
    'SELECT id,creator_id AS creatorId,status FROM courses WHERE id=? LIMIT 1',
    [courseId]
  );
  const course = rows[0];
  if (!course) return null;
  const globalAccess = hasCapability(actor.role, CAPABILITIES.COURSE_MANAGE_ALL);
  return globalAccess || Number(course.creatorId) === Number(actor.id) ? course : false;
}

module.exports = { normalizeCoursePayload, courseForManagement };
