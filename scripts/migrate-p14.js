const pool = require('../src/config/database');

async function columnExists(table, column) {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
  return Number(row.total) > 0;
}
async function constraintExists(name) {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?', [name]);
  return Number(row.total) > 0;
}

async function migrate() {
  if (!await columnExists('appointments', 'hold_reference')) await pool.query('ALTER TABLE appointments ADD COLUMN hold_reference CHAR(36) NULL AFTER public_id');
  if (!await columnExists('appointments', 'payment_expires_at')) await pool.query('ALTER TABLE appointments ADD COLUMN payment_expires_at DATETIME NULL AFTER order_id');
  if (!await constraintExists('uq_appointment_hold')) await pool.query('ALTER TABLE appointments ADD UNIQUE KEY uq_appointment_hold (hold_reference)');
  console.log('Migración P14 aplicada correctamente.');
}

migrate().catch(error => { console.error('No se pudo aplicar P14:', error.message); process.exitCode = 1; }).finally(() => pool.end());
