const pool = require('../src/config/database');
async function migrate() {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='articles' AND column_name='pdf_url'");
  if (!Number(row.total)) await pool.query('ALTER TABLE articles ADD COLUMN pdf_url VARCHAR(1000) NULL AFTER body');
  console.log('Migración P16 aplicada correctamente.');
}
migrate().catch(error => { console.error('No se pudo aplicar P16:', error.message); process.exitCode = 1; }).finally(() => pool.end());
