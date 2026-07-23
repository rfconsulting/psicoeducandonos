const pool = require('../src/config/database');

async function columnExists(column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) total FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='users' AND column_name=?`, [column]
  );
  return Number(rows[0].total) > 0;
}

async function main() {
  if (!(await columnExists('email_verified_at'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER must_change_password');
    await pool.execute('UPDATE users SET email_verified_at=UTC_TIMESTAMP()');
  }
  if (!(await columnExists('mfa_enabled'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER email_verified_at');
  }
  if (!(await columnExists('mfa_secret_encrypted'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN mfa_secret_encrypted TEXT NULL AFTER mfa_enabled');
  }
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      expires_at DATETIME NOT NULL, used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uq_email_verification_hash (token_hash),
      KEY idx_email_verification_user (user_id), KEY idx_email_verification_expiry (expires_at),
      CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`
  );
  console.log('Migración P3 aplicada correctamente.');
}
main().catch(error => { console.error(`No se pudo aplicar P3: ${error.message}`); process.exitCode=1; }).finally(()=>pool.end());
