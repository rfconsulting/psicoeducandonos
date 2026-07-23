const express = require('express');
const pool = require('../config/database');
const { requireCapability } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const { pagination, page } = require('../utils/pagination');

const router = express.Router();
const ROLES = new Set(['superuser', 'administrator', 'teacher', 'writer', 'student']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeDate(value) {
  const text = String(value || '');
  if (!DATE_RE.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

router.get('/', requireCapability(CAPABILITIES.AUDIT_VIEW), async (req, res, next) => {
  try {
    const paging = pagination(req.query, 30, 100);
    const responsible = String(req.query.responsible || '').trim().slice(0, 120);
    const action = String(req.query.action || '').trim().slice(0, 80);
    const role = String(req.query.role || '').trim();
    const dateFrom = safeDate(req.query.dateFrom);
    const dateTo = safeDate(req.query.dateTo);
    if (req.query.role && !ROLES.has(role)) return res.status(422).json({ error: 'El rol indicado no es válido.' });
    if (req.query.dateFrom && !dateFrom) return res.status(422).json({ error: 'La fecha inicial no es válida.' });
    if (req.query.dateTo && !dateTo) return res.status(422).json({ error: 'La fecha final no es válida.' });
    if (dateFrom && dateTo && dateFrom > dateTo) return res.status(422).json({ error: 'El rango de fechas no es válido.' });

    const conditions = [];
    const values = [];
    if (responsible) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      const search = `%${responsible.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(search, search);
    }
    if (action) { conditions.push('a.action=?'); values.push(action); }
    if (role) { conditions.push('u.role=?'); values.push(role); }
    if (dateFrom) { conditions.push('a.created_at>=?'); values.push(`${dateFrom} 00:00:00`); }
    if (dateTo) { conditions.push('a.created_at<DATE_ADD(?,INTERVAL 1 DAY)'); values.push(`${dateTo} 00:00:00`); }
    if (paging.cursor) { conditions.push('a.id<?'); values.push(paging.cursor); }
    values.push(paging.limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [activities] = await pool.execute(
      `SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,
              a.created_at AS createdAt,
              u.id AS actorId,u.full_name AS actorName,u.email AS actorEmail,u.role AS actorRole
       FROM audit_log a
       LEFT JOIN users u ON u.id=a.actor_user_id
       ${where}
       ORDER BY a.id DESC
       LIMIT ?`,
      values
    );
    const result = page(activities, paging.limit);
    return res.json({ activities: result.items, nextCursor: result.nextCursor });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
