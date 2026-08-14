const pool = require('../src/config/database');
async function columnExists(column) { const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='payments' AND column_name=?", [column]); return Number(row.total) > 0; }
async function migrate() {
  if (!await columnExists('provider_checkout_id')) await pool.query('ALTER TABLE payments ADD COLUMN provider_checkout_id VARCHAR(128) NULL AFTER provider');
  await pool.query('ALTER TABLE payments MODIFY provider_payment_id VARCHAR(128) NULL');
  console.log('Migración P15 aplicada correctamente.');
}
migrate().catch(error => { console.error('No se pudo aplicar P15:', error.message); process.exitCode = 1; }).finally(() => pool.end());
