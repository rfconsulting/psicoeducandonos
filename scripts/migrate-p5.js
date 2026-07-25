const pool = require('../src/config/database');

async function addColumn(name, definition) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='lessons' AND column_name=? LIMIT 1`,
    [name]
  );
  if (!rows.length) await pool.query(`ALTER TABLE lessons ADD COLUMN ${definition}`);
}

async function migrate() {
  await addColumn('video_url', "video_url VARCHAR(500) NOT NULL DEFAULT '' AFTER estimated_minutes");
  await addColumn('pdf_url', "pdf_url VARCHAR(500) NOT NULL DEFAULT '' AFTER video_url");
  await addColumn('slides_url', 'slides_url VARCHAR(500) NULL AFTER pdf_url');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lesson_id BIGINT UNSIGNED NOT NULL,
      question_text VARCHAR(1000) NOT NULL,
      position TINYINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_lesson_question_position (lesson_id, position),
      CONSTRAINT fk_question_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      CONSTRAINT chk_question_position CHECK (position BETWEEN 1 AND 6)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_question_options (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      question_id BIGINT UNSIGNED NOT NULL,
      option_text VARCHAR(500) NOT NULL,
      position TINYINT UNSIGNED NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (id),
      UNIQUE KEY uq_question_option_position (question_id, position),
      KEY idx_option_question_correct (question_id, is_correct),
      CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES lesson_questions(id) ON DELETE CASCADE,
      CONSTRAINT chk_option_position CHECK (position BETWEEN 1 AND 4)
    ) ENGINE=InnoDB
  `);
  console.log('Migración P5 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P5:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
