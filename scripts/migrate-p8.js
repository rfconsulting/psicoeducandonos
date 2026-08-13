const pool = require('../src/config/database');

async function migrate() {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='users' AND column_name='registration_source' LIMIT 1`
  );
  if (!rows.length) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN registration_source ENUM('admin','application','public','legacy') NOT NULL DEFAULT 'legacy' AFTER status"
    );
  }
  console.log('Migración P8 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P8:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
