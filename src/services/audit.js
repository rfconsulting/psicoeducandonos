const pool = require('../config/database');

async function audit(req, action, targetType = null, targetId = null, details = null, options = {}) {
  const db = options.db || pool;
  try {
    await db.execute(
      'INSERT INTO audit_log (actor_user_id, action, target_type, target_id, ip_address, details) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session?.user?.id || null, action, targetType, targetId, req.ip, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    if (options.required) throw error;
    console.error('No se pudo registrar auditoría:', error.message);
  }
}

module.exports = audit;
