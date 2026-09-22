const pool = require('../src/config/database');

async function columnExists(column) {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='professional_profiles' AND column_name=?", [column]);
  return Number(row.total) > 0;
}

async function migrate() {
  if (!await columnExists('photo_mime')) await pool.query('ALTER TABLE professional_profiles ADD COLUMN photo_mime VARCHAR(20) NULL AFTER bio');
  if (!await columnExists('photo_data')) await pool.query('ALTER TABLE professional_profiles ADD COLUMN photo_data MEDIUMBLOB NULL AFTER photo_mime');
  console.log('Migración P22 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P22:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
