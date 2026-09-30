const pool = require('../src/config/database');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS lesson_answer_reviews (
    enrollment_id BIGINT UNSIGNED NOT NULL,
    lesson_id BIGINT UNSIGNED NOT NULL,
    question_position TINYINT UNSIGNED NOT NULL,
    question_text VARCHAR(1000) NOT NULL,
    selected_option_position TINYINT UNSIGNED NOT NULL,
    selected_option_text VARCHAR(500) NOT NULL,
    answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (enrollment_id,lesson_id,question_position),
    KEY idx_lesson_answer_review (lesson_id,enrollment_id),
    CONSTRAINT fk_answer_review_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
    CONSTRAINT fk_answer_review_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    CONSTRAINT chk_answer_review_question_position CHECK (question_position BETWEEN 1 AND 6),
    CONSTRAINT chk_answer_review_option_position CHECK (selected_option_position BETWEEN 1 AND 4)
  ) ENGINE=InnoDB`);
  console.log('Migración P26 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P26:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
