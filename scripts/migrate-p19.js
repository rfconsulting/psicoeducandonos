const pool = require('../src/config/database');

async function columnExists(column) {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='payments' AND column_name=?", [column]);
  return Number(row.total) > 0;
}

async function migrate() {
  if (!await columnExists('checkout_url')) await pool.query('ALTER TABLE payments ADD COLUMN checkout_url VARCHAR(1000) NULL AFTER provider_payment_id');
  console.log('Migración P19 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P19:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
