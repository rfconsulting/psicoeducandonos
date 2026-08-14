const pool = require('../src/config/database');

async function addColumn(table, column, definition) {
  const [[existing]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [table, column]
  );
  if (!Number(existing.total)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrate() {
  await addColumn('courses', 'access_type', "ENUM('free','paid') NOT NULL DEFAULT 'free' AFTER status");
  await addColumn('courses', 'enrollment_policy', "ENUM('open','approved_students','admin_only') NOT NULL DEFAULT 'admin_only' AFTER access_type");
  await addColumn('course_enrollments', 'enrollment_source', "ENUM('legacy','admin','free_self','paid') NOT NULL DEFAULT 'legacy' AFTER enrolled_by");
  console.log('Migración P11 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P11:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
