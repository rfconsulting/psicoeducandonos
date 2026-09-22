const pool = require('../src/config/database');

async function columnExists(column) {
  const [[row]] = await pool.execute("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='professional_profiles' AND column_name=?", [column]);
  return Number(row.total) > 0;
}
async function constraintExists(name) {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?', [name]);
  return Number(row.total) > 0;
}

async function migrate() {
  if (!await columnExists('credential_status')) await pool.query("ALTER TABLE professional_profiles ADD COLUMN credential_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending' AFTER status");
  if (!await columnExists('verification_notes')) await pool.query('ALTER TABLE professional_profiles ADD COLUMN verification_notes VARCHAR(2000) NULL AFTER credential_status');
  if (!await columnExists('verified_by')) await pool.query('ALTER TABLE professional_profiles ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER verification_notes');
  if (!await columnExists('verified_at')) await pool.query('ALTER TABLE professional_profiles ADD COLUMN verified_at DATETIME NULL AFTER verified_by');
  if (!await constraintExists('fk_professional_verifier')) await pool.query('ALTER TABLE professional_profiles ADD CONSTRAINT fk_professional_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT');
  console.log('Migración P21 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P21:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
