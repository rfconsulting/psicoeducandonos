const pool = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].total) > 0;
}

async function main() {
  if (!(await columnExists('users', 'auth_version'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER status');
  }
  if (!(await columnExists('users', 'must_change_password'))) {
    await pool.execute('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER auth_version');
  }
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_password_reset_hash (token_hash),
      KEY idx_password_reset_user (user_id),
      KEY idx_password_reset_expiry (expires_at),
      CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`
  );
  console.log('Migración P1 aplicada correctamente.');
}

main().catch((error) => {
  console.error(`No se pudo aplicar la migración P1: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
