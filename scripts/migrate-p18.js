const pool = require('../src/config/database');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS module_certification_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    module_id BIGINT UNSIGNED NOT NULL,
    area ENUM('supervision','practice','personal_work') NOT NULL,
    question_text VARCHAR(2000) NOT NULL,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_module_certification_area (module_id,area),
    CONSTRAINT fk_module_certification_question_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE,
    CONSTRAINT fk_module_certification_question_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS module_certification_records (
    enrollment_id BIGINT UNSIGNED NOT NULL,
    module_id BIGINT UNSIGNED NOT NULL,
    area ENUM('supervision','practice','personal_work') NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    answer_text TEXT NULL,
    answer_status ENUM('pending','submitted','changes_requested','reviewed') NOT NULL DEFAULT 'pending',
    certified BOOLEAN NOT NULL DEFAULT FALSE,
    teacher_observation TEXT NULL,
    submitted_at DATETIME NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (enrollment_id,module_id,area),
    KEY idx_module_certification_records_module (module_id),
    KEY idx_module_certification_records_question (question_id),
    CONSTRAINT fk_module_certification_record_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
    CONSTRAINT fk_module_certification_record_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE,
    CONSTRAINT fk_module_certification_record_question FOREIGN KEY (question_id) REFERENCES module_certification_questions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_module_certification_record_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  console.log('Migración P18 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P18:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
