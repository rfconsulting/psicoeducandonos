const pool = require('../config/database');

async function listArticles({ userId, globalAccess, canAuthor, cursor, limit }) {
  const conditions = [];
  const values = [];
  if (!globalAccess) {
    if (canAuthor) { conditions.push("(a.status='published' OR a.author_id=?)"); values.push(userId); }
    else conditions.push("a.status='published'");
  }
  if (cursor) { conditions.push('a.id < ?'); values.push(cursor); }
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT a.id,a.author_id AS authorId,a.title,a.slug,a.summary,a.status,a.created_at AS createdAt,u.full_name AS author
     FROM articles a JOIN users u ON u.id=a.author_id ${where} ORDER BY a.id DESC LIMIT ?`,
    values
  );
  return rows;
}

async function listCourses({ userId, globalAccess, canCreate, cursor, limit }) {
  const conditions = [];
  const values = [];
  if (!globalAccess) {
    if (canCreate) { conditions.push("(c.status='published' OR c.creator_id=?)"); values.push(userId); }
    else conditions.push("c.status='published'");
  }
  if (cursor) { conditions.push('c.id < ?'); values.push(cursor); }
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT c.id,c.creator_id AS creatorId,c.title,c.slug,c.description,c.status,c.created_at AS createdAt,u.full_name AS creator
     FROM courses c JOIN users u ON u.id=c.creator_id ${where} ORDER BY c.id DESC LIMIT ?`,
    values
  );
  return rows;
}

module.exports = { listArticles, listCourses };
