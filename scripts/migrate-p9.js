const pool = require('../src/config/database');

const statements = [
  `CREATE TABLE IF NOT EXISTS student_profiles (
    user_id BIGINT UNSIGNED NOT NULL,
    phone VARCHAR(40) NULL, country VARCHAR(80) NULL, province VARCHAR(100) NULL, city VARCHAR(100) NULL,
    birth_date DATE NULL,
    document_type ENUM('national_id','passport','other') NULL,
    document_number VARCHAR(80) NULL,
    profession VARCHAR(120) NULL,
    education_level ENUM('secondary','technical','university','postgraduate','other') NULL,
    specialization VARCHAR(160) NULL, institution VARCHAR(180) NULL, license_number VARCHAR(80) NULL,
    years_experience TINYINT UNSIGNED NULL,
    pathway ENUM('accompaniment','health-professional','undecided') NULL,
    motivation TEXT NULL, bio TEXT NULL,
    review_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL DEFAULT 'draft',
    submitted_at DATETIME NULL, approved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id), KEY idx_student_profiles_review (review_status,submitted_at),
    CONSTRAINT fk_student_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS student_profile_consents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_profile_user_id BIGINT UNSIGNED NOT NULL,
    consent_type ENUM('privacy','data_accuracy') NOT NULL,
    version VARCHAR(32) NOT NULL,
    accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_consent_version (student_profile_user_id,consent_type,version),
    CONSTRAINT fk_student_consent_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS student_profile_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_profile_user_id BIGINT UNSIGNED NOT NULL,
    document_type ENUM('identity','professional_license','other') NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_student_documents_profile (student_profile_user_id,status),
    UNIQUE KEY uq_student_document_storage (storage_key),
    CONSTRAINT fk_student_document_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

async function migrate() {
  for (const statement of statements) await pool.query(statement);
  console.log('Migración P9 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P9:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
