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
  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,course_id BIGINT UNSIGNED NULL,name VARCHAR(180) NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_products_course (course_id),
    CONSTRAINT fk_product_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS product_prices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,product_id BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,amount_minor BIGINT UNSIGNED NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (id),KEY idx_product_prices_active (product_id,active,currency),
    CONSTRAINT fk_price_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT chk_price_positive CHECK (amount_minor > 0)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,public_id CHAR(36) NOT NULL,buyer_user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','processing','paid','cancelled','expired','partially_refunded','refunded') NOT NULL DEFAULT 'pending',
    currency CHAR(3) NOT NULL,total_minor BIGINT UNSIGNED NOT NULL,paid_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_orders_public (public_id),KEY idx_orders_buyer (buyer_user_id,created_at),
    CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,order_id BIGINT UNSIGNED NOT NULL,product_id BIGINT UNSIGNED NOT NULL,
    description VARCHAR(180) NOT NULL,unit_amount_minor BIGINT UNSIGNED NOT NULL,quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id),KEY idx_order_items_order (order_id),CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_order_item_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,order_id BIGINT UNSIGNED NOT NULL,provider VARCHAR(32) NOT NULL,provider_payment_id VARCHAR(128) NOT NULL,
    status ENUM('pending','approved','rejected','cancelled','refunded') NOT NULL DEFAULT 'pending',currency CHAR(3) NOT NULL,amount_minor BIGINT UNSIGNED NOT NULL,
    approved_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_payment_provider_id (provider,provider_payment_id),KEY idx_payments_order (order_id),
    CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,payment_id BIGINT UNSIGNED NULL,provider VARCHAR(32) NOT NULL,provider_event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,payload_hash CHAR(64) NOT NULL,processing_status ENUM('processed','ignored','failed') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (id),UNIQUE KEY uq_payment_event (provider,provider_event_id),
    CONSTRAINT fk_payment_event_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  if (!await columnExists('course_enrollments', 'order_id')) await pool.query('ALTER TABLE course_enrollments ADD COLUMN order_id BIGINT UNSIGNED NULL AFTER enrollment_source');
  if (!await constraintExists('fk_enrollment_order')) await pool.query('ALTER TABLE course_enrollments ADD CONSTRAINT fk_enrollment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT');
  console.log('Migración P12 aplicada correctamente.');
}

migrate().catch(error => { console.error('No se pudo aplicar P12:', error.message); process.exitCode = 1; }).finally(() => pool.end());
