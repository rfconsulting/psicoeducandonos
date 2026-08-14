const pool = require('../src/config/database');

async function columnExists(table, column) {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
  return Number(row.total) > 0;
}
async function constraintExists(name) {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS total FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?', [name]);
  return Number(row.total) > 0;
}

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS professional_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,
    professional_type ENUM('psychologist','counselor') NOT NULL,license_number VARCHAR(80) NULL,specialties VARCHAR(500) NULL,bio TEXT NULL,
    timezone VARCHAR(64) NOT NULL,status ENUM('draft','active','suspended') NOT NULL DEFAULT 'draft',created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_professional_user (user_id),KEY idx_professional_status (status),
    CONSTRAINT fk_professional_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS professional_services (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,professional_id BIGINT UNSIGNED NOT NULL,
    service_type ENUM('psychology','counseling') NOT NULL,name VARCHAR(180) NOT NULL,description TEXT NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),KEY idx_services_professional (professional_id,active),
    CONSTRAINT fk_service_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT chk_service_duration CHECK (duration_minutes BETWEEN 15 AND 240)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS availability_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,professional_id BIGINT UNSIGNED NOT NULL,
    weekday ENUM('sun','mon','tue','wed','thu','fri','sat') NOT NULL,start_time TIME NOT NULL,end_time TIME NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),KEY idx_availability_professional (professional_id,weekday,active),
    CONSTRAINT fk_availability_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE,
    CONSTRAINT chk_availability_range CHECK (end_time > start_time)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS availability_exceptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,professional_id BIGINT UNSIGNED NOT NULL,exception_date DATE NOT NULL,
    start_time TIME NOT NULL,end_time TIME NOT NULL,exception_type ENUM('blocked','available') NOT NULL,
    PRIMARY KEY (id),KEY idx_exception_professional_date (professional_id,exception_date),
    CONSTRAINT fk_exception_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS appointment_holds (
    id CHAR(36) NOT NULL,professional_id BIGINT UNSIGNED NOT NULL,service_id BIGINT UNSIGNED NOT NULL,client_user_id BIGINT UNSIGNED NOT NULL,
    start_at DATETIME NOT NULL,end_at DATETIME NOT NULL,expires_at DATETIME NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_hold_professional_start (professional_id,start_at),KEY idx_holds_expiry (expires_at),
    CONSTRAINT fk_hold_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_hold_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT,
    CONSTRAINT fk_hold_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS appointments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,public_id CHAR(36) NOT NULL,professional_id BIGINT UNSIGNED NOT NULL,service_id BIGINT UNSIGNED NOT NULL,client_user_id BIGINT UNSIGNED NOT NULL,
    start_at DATETIME NOT NULL,end_at DATETIME NOT NULL,timezone VARCHAR(64) NOT NULL,
    status ENUM('held','pending_payment','confirmed','completed','expired','cancelled_by_client','cancelled_by_professional','no_show','refunded') NOT NULL DEFAULT 'held',
    order_id BIGINT UNSIGNED NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_appointment_public (public_id),KEY idx_appointment_professional (professional_id,start_at),KEY idx_appointment_client (client_user_id,start_at),
    CONSTRAINT fk_appointment_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS appointment_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,appointment_id BIGINT UNSIGNED NOT NULL,actor_user_id BIGINT UNSIGNED NULL,event_type VARCHAR(64) NOT NULL,
    old_start_at DATETIME NULL,new_start_at DATETIME NULL,details JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),KEY idx_appointment_events (appointment_id,id),
    CONSTRAINT fk_appointment_event_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  if (!await columnExists('products', 'service_id')) await pool.query('ALTER TABLE products ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER course_id');
  if (!await constraintExists('uq_products_service')) await pool.query('ALTER TABLE products ADD UNIQUE KEY uq_products_service (service_id)');
  if (!await constraintExists('fk_product_service')) await pool.query('ALTER TABLE products ADD CONSTRAINT fk_product_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT');
  console.log('Migración P13 aplicada correctamente.');
}

migrate().catch(error => { console.error('No se pudo aplicar P13:', error.message); process.exitCode = 1; }).finally(() => pool.end());
