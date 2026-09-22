const pool = require('../src/config/database');

async function columnExists(column) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',
    ['users', column]
  );
  return Number(row.total) > 0;
}

async function migrate() {
  if (!await columnExists('mfa_failed_attempts')) {
    await pool.query('ALTER TABLE users ADD COLUMN mfa_failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER mfa_secret_encrypted');
  }
  if (!await columnExists('mfa_locked_until')) {
    await pool.query('ALTER TABLE users ADD COLUMN mfa_locked_until DATETIME NULL AFTER mfa_failed_attempts');
  }
  console.log('Migración P24 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P24:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
