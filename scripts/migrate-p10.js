const pool = require('../src/config/database');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS student_profile_reviews (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_profile_user_id BIGINT UNSIGNED NOT NULL,
    reviewer_user_id BIGINT UNSIGNED NOT NULL,
    from_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL,
    decision ENUM('start_review','request_changes','approve','reject','reopen') NOT NULL,
    to_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_profile_reviews_profile (student_profile_user_id,id),
    KEY idx_profile_reviews_reviewer (reviewer_user_id,created_at),
    CONSTRAINT fk_profile_review_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_profile_review_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  console.log('Migración P10 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P10:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
