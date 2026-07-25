const pool = require('../src/config/database');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enrollment_support_tracking (
      enrollment_id BIGINT UNSIGNED NOT NULL,
      updated_by BIGINT UNSIGNED NOT NULL,
      supervision_completed BOOLEAN NOT NULL DEFAULT FALSE,
      supervision_notes TEXT NULL,
      practice_completed BOOLEAN NOT NULL DEFAULT FALSE,
      practice_notes TEXT NULL,
      therapy_attendance BOOLEAN NOT NULL DEFAULT FALSE,
      therapy_notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (enrollment_id),
      CONSTRAINT fk_support_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
      CONSTRAINT fk_support_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);
  console.log('Migración P6 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P6:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
