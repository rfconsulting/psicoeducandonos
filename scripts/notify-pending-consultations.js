const pool = require('../src/config/database');
const { createNotification, emailNotification } = require('../src/services/notifications');

async function run() {
  const [pending] = await pool.execute(`SELECT r.id,r.user_id AS userId,u.email,c.name AS serviceName,r.created_at AS createdAt
    FROM service_requests r JOIN users u ON u.id=r.user_id AND u.status='active'
    JOIN service_type_catalog c ON c.code=r.service_type
    WHERE r.status IN ('pending_scheduling','needs_classification','safety_review') AND r.created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)`);
  let sent = 0;
  for (const item of pending) {
    const [[recent]] = await pool.execute(`SELECT id FROM notifications WHERE user_id=? AND type='consultation_pending'
      AND message LIKE ? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) LIMIT 1`, [item.userId, `%#${item.id}%`]);
    if (recent) continue;
    const message = `Tu solicitud de ${item.serviceName} continúa pendiente de coordinación. Referencia interna #${item.id}.`;
    const notificationId = await createNotification({ userId: item.userId, type: 'consultation_pending', title: 'Consulta pendiente de coordinación', message, actionUrl: '/estudiante.html' });
    await emailNotification({ to: item.email, title: 'Consulta pendiente de coordinación', message, actionUrl: '/estudiante.html', idempotencyKey: `consultation-pending/${item.id}/${new Date().toISOString().slice(0, 10)}` });
    sent += 1;
    console.log(`Notificación ${notificationId} creada para solicitud ${item.id}.`);
  }
  console.log(`Notificaciones de consultas pendientes: ${sent}.`);
}

run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
