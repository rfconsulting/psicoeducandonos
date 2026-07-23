const pool = require('../src/config/database');

async function migrate() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS applications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      age_range ENUM('18-25','26-40','41-60','61-plus') NOT NULL,
      location VARCHAR(160) NOT NULL,
      pathway ENUM('accompaniment','health-professional') NOT NULL,
      crisis_experience BOOLEAN NOT NULL,
      motivation TEXT NOT NULL,
      referral_source ENUM('instagram','facebook','whatsapp','acquaintance','other') NOT NULL,
      privacy_consent BOOLEAN NOT NULL,
      supervision_commitment BOOLEAN NOT NULL,
      newsletter_consent BOOLEAN NOT NULL DEFAULT FALSE,
      attended_info_session BOOLEAN NULL,
      session_feedback TEXT NULL,
      status ENUM('pending','reviewing','approved','waitlisted','rejected') NOT NULL DEFAULT 'pending',
      review_notes TEXT NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_applications_status_created (status, created_at),
      KEY idx_applications_email (email),
      KEY idx_applications_reviewer (reviewed_by),
      CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
  console.log('Migración P4 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P4:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
