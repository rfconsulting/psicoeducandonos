const pool = require('../src/config/database');

async function main() {
  const [columns] = await pool.execute(
    `SELECT COUNT(*) AS total FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'auth_version'`
  );

  if (Number(columns[0].total) === 0) {
    await pool.execute('ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER status');
    console.log('Migración P0 aplicada: users.auth_version creado.');
  } else {
    console.log('Migración P0 ya aplicada.');
  }
}

main()
  .catch((error) => {
    console.error(`No se pudo aplicar la migración P0: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
