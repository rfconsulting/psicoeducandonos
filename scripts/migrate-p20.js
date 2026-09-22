const pool = require('../src/config/database');

async function migrate() {
  await pool.query("ALTER TABLE professional_profiles MODIFY professional_type ENUM('psychologist','psychiatrist','counselor') NOT NULL");
  await pool.query("ALTER TABLE professional_services MODIFY service_type ENUM('psychology','psychiatry','counseling') NOT NULL");
  console.log('Migración P20 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P20:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
