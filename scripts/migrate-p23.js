const pool = require('../src/config/database');

async function migrate() {
  await pool.query("ALTER TABLE professional_profiles MODIFY professional_type ENUM('psychologist','psychiatrist','psychopedagogue','counselor') NOT NULL");
  await pool.query("ALTER TABLE professional_services MODIFY service_type ENUM('psychology','psychiatry','psychopedagogy','counseling') NOT NULL");
  console.log('Migración P23 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P23:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
