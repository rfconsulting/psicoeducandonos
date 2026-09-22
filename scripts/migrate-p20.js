const pool = require('../src/config/database');

async function migrate() {
  const [[profileColumn]] = await pool.query("SHOW COLUMNS FROM professional_profiles LIKE 'professional_type'");
  const [[serviceColumn]] = await pool.query("SHOW COLUMNS FROM professional_services LIKE 'service_type'");
  if (!profileColumn.Type.includes("'psychiatrist'")) await pool.query("ALTER TABLE professional_profiles MODIFY professional_type ENUM('psychologist','psychiatrist','counselor') NOT NULL");
  if (!serviceColumn.Type.includes("'psychiatry'")) await pool.query("ALTER TABLE professional_services MODIFY service_type ENUM('psychology','psychiatry','counseling') NOT NULL");
  console.log('Migración P20 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P20:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
