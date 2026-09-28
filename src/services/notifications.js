const pool = require('../config/database');
const { getEmailService } = require('./email');

async function createNotification({ userId, type, title, message, actionUrl = null, db = pool }) {
  const [result] = await db.execute(
    'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
    [userId, String(type).slice(0, 64), String(title).slice(0, 180), String(message).slice(0, 1000), actionUrl]
  );
  return result.insertId;
}

async function emailNotification({ to, title, message, actionUrl = null, idempotencyKey }) {
  if (!to) return false;
  try {
    return await getEmailService().sendNotification({ to, title, message, actionUrl, idempotencyKey });
  } catch (error) {
    console.error('No se pudo entregar la notificación:', error.message);
    return false;
  }
}

module.exports = { createNotification, emailNotification };
