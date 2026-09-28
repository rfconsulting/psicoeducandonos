const pool = require('../src/config/database');

async function migrate() {
  const [[profileColumn]] = await pool.query("SHOW COLUMNS FROM professional_profiles LIKE 'professional_type'");
  const [[serviceColumn]] = await pool.query("SHOW COLUMNS FROM professional_services LIKE 'service_type'");
  if (profileColumn.Type.startsWith('enum(') && !profileColumn.Type.includes("'psychopedagogue'")) {
    await pool.query("ALTER TABLE professional_profiles MODIFY professional_type ENUM('psychologist','psychiatrist','psychopedagogue','counselor') NOT NULL");
  }
  // A VARCHAR here is the newer catalog-backed representation and already
  // supports psychopedagogy without altering the foreign-key column.
  if (serviceColumn.Type.startsWith('enum(') && !serviceColumn.Type.includes("'psychopedagogy'")) {
    await pool.query("ALTER TABLE professional_services MODIFY service_type ENUM('psychology','psychiatry','psychopedagogy','counseling') NOT NULL");
  }
  console.log('Migración P23 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P23:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
