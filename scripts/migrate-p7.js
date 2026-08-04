const pool = require('../src/config/database');

async function addColumn(name, definition) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='enrollment_support_tracking' AND column_name=? LIMIT 1`,
    [name]
  );
  if (!rows.length) await pool.query(`ALTER TABLE enrollment_support_tracking ADD COLUMN ${definition}`);
}

async function migrate() {
  await addColumn(
    'personal_work_completed',
    'personal_work_completed BOOLEAN NOT NULL DEFAULT FALSE AFTER practice_notes'
  );
  await addColumn(
    'personal_work_notes',
    'personal_work_notes TEXT NULL AFTER personal_work_completed'
  );
  await pool.query(`
    UPDATE enrollment_support_tracking
    SET personal_work_completed=therapy_attendance,
        personal_work_notes=therapy_notes
    WHERE personal_work_completed=FALSE
      AND (therapy_attendance=TRUE OR (personal_work_notes IS NULL AND therapy_notes IS NOT NULL))
  `);
  console.log('Migración P7 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P7:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
