const pool = require('../src/config/database');

async function run() {
  const [result] = await pool.execute('DELETE FROM appointment_holds WHERE expires_at<=UTC_TIMESTAMP()');
  const [appointments] = await pool.execute("UPDATE appointments SET status='expired' WHERE status='pending_payment' AND payment_expires_at<=UTC_TIMESTAMP()");
  console.log(`Holds expirados liberados: ${result.affectedRows}.`);
  console.log(`Citas pendientes expiradas: ${appointments.affectedRows}.`);
}

run().catch(error => { console.error('No se pudieron liberar holds:', error.message); process.exitCode = 1; }).finally(() => pool.end());
