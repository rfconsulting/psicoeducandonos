const pool = require('../src/config/database');

const statements = [
  `CREATE TABLE IF NOT EXISTS course_modules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, course_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL, position SMALLINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_course_module_position (course_id,position),
    CONSTRAINT fk_module_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, module_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL, content MEDIUMTEXT NOT NULL, position SMALLINT UNSIGNED NOT NULL,
    estimated_minutes SMALLINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_module_lesson_position (module_id,position),
    CONSTRAINT fk_lesson_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS course_enrollments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, course_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL, enrolled_by BIGINT UNSIGNED NOT NULL,
    status ENUM('active','completed','withdrawn') NOT NULL DEFAULT 'active',
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL,
    PRIMARY KEY (id), UNIQUE KEY uq_course_student (course_id,student_id),
    KEY idx_enrollment_student_status (student_id,status),
    CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_actor FOREIGN KEY (enrolled_by) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS lesson_progress (
    enrollment_id BIGINT UNSIGNED NOT NULL, lesson_id BIGINT UNSIGNED NOT NULL,
    completed_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (enrollment_id,lesson_id), KEY idx_progress_lesson (lesson_id),
    CONSTRAINT fk_progress_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
    CONSTRAINT fk_progress_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

async function main() {
  for (const statement of statements) await pool.execute(statement);
  console.log('Migración P2 aplicada correctamente.');
}
main().catch(error => { console.error(`No se pudo aplicar P2: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
