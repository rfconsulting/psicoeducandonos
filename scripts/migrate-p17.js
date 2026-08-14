const pool = require('../src/config/database');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS legacy_student_profile_migrations (
    application_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    imported_fields JSON NOT NULL,
    legacy_status VARCHAR(24) NOT NULL,
    migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (application_id),
    UNIQUE KEY uq_legacy_profile_migration_user (user_id),
    CONSTRAINT fk_legacy_profile_migration_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT,
    CONSTRAINT fk_legacy_profile_migration_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  console.log('Migracion P17 aplicada correctamente.');
}

migrate().catch(error => {
  console.error('No se pudo aplicar P17:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
