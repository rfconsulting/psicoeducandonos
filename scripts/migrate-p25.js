const pool = require('../src/config/database');

async function columnExists(table, column) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',
    [table, column]
  );
  return Number(row.total) > 0;
}

async function constraintExists(name) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) total FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?',
    [name]
  );
  return Number(row.total) > 0;
}

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS service_type_catalog (
    code VARCHAR(64) NOT NULL,name VARCHAR(120) NOT NULL,
    care_domain ENUM('clinical','medical','psychoeducational','pastoral','educational','professional','unclassified') NOT NULL,
    schedulable BOOLEAN NOT NULL DEFAULT TRUE,active BOOLEAN NOT NULL DEFAULT TRUE,sort_order SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (code),UNIQUE KEY uq_service_type_order (sort_order)
  ) ENGINE=InnoDB`);
  const types = [
    ['psychological_consultation','Consulta psicológica','clinical',1,10],
    ['psychiatric_consultation','Consulta psiquiátrica','medical',1,20],
    ['psychoeducational_guidance','Orientación psicoeducativa','psychoeducational',1,30],
    ['pastoral_counseling','Consejería pastoral','pastoral',1,40],
    ['couples_family_therapy','Terapia de pareja o familiar','clinical',1,50],
    ['workshop_course','Taller o curso','educational',1,60],
    ['professional_supervision','Supervisión profesional','professional',1,70],
    ['other','Otro servicio','unclassified',0,80]
  ];
  for (const type of types) await pool.execute(`INSERT INTO service_type_catalog (code,name,care_domain,schedulable,sort_order)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),care_domain=VALUES(care_domain),schedulable=VALUES(schedulable)`, type);

  const [[serviceType]] = await pool.query("SHOW COLUMNS FROM professional_services LIKE 'service_type'");
  if (serviceType.Type.startsWith('enum(')) await pool.query('ALTER TABLE professional_services MODIFY service_type VARCHAR(64) NOT NULL');
  await pool.query(`UPDATE professional_services SET service_type=CASE service_type
    WHEN 'psychology' THEN 'psychological_consultation' WHEN 'psychiatry' THEN 'psychiatric_consultation'
    WHEN 'psychopedagogy' THEN 'psychoeducational_guidance' WHEN 'counseling' THEN 'pastoral_counseling'
    ELSE service_type END`);
  if (!await columnExists('professional_services', 'delivery_mode')) await pool.query("ALTER TABLE professional_services ADD COLUMN delivery_mode ENUM('online','in_person','hybrid') NOT NULL DEFAULT 'online' AFTER description");
  if (!await columnExists('professional_services', 'participant_format')) await pool.query("ALTER TABLE professional_services ADD COLUMN participant_format ENUM('individual','couple','family','group') NOT NULL DEFAULT 'individual' AFTER delivery_mode");
  if (!await constraintExists('fk_service_type')) await pool.query('ALTER TABLE professional_services ADD CONSTRAINT fk_service_type FOREIGN KEY (service_type) REFERENCES service_type_catalog(code)');

  await pool.query(`CREATE TABLE IF NOT EXISTS professional_service_authorizations (
    professional_id BIGINT UNSIGNED NOT NULL,service_type_code VARCHAR(64) NOT NULL,authorized_by BIGINT UNSIGNED NULL,
    authorized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (professional_id,service_type_code),
    CONSTRAINT fk_service_authorization_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_service_authorization_type FOREIGN KEY (service_type_code) REFERENCES service_type_catalog(code),
    CONSTRAINT fk_service_authorization_actor FOREIGN KEY (authorized_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  await pool.query(`INSERT IGNORE INTO professional_service_authorizations (professional_id,service_type_code)
    SELECT DISTINCT professional_id,service_type FROM professional_services`);

  await pool.query(`CREATE TABLE IF NOT EXISTS service_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,public_id CHAR(36) NOT NULL,user_id BIGINT UNSIGNED NOT NULL,
    service_type VARCHAR(64) NOT NULL,delivery_mode ENUM('online','in_person') NOT NULL,
    participant_format ENUM('individual','couple','family','group') NOT NULL,
    reason_category ENUM('anxiety_panic','grief','family_conflict','stress','couple_problems','parent_guidance','other') NOT NULL,
    timezone VARCHAR(64) NOT NULL,preferred_professional_id BIGINT UNSIGNED NULL,
    emergency_current BOOLEAN NOT NULL DEFAULT FALSE,self_or_others_risk BOOLEAN NOT NULL DEFAULT FALSE,
    physical_symptoms BOOLEAN NOT NULL DEFAULT FALSE,notes VARCHAR(2000) NULL,
    status ENUM('pending_scheduling','safety_review','needs_classification','scheduled','cancelled') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_service_request_public (public_id),KEY idx_service_request_user (user_id,created_at),
    KEY idx_service_request_status (status,created_at),CONSTRAINT fk_service_request_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_service_request_type FOREIGN KEY (service_type) REFERENCES service_type_catalog(code),
    CONSTRAINT fk_service_request_professional FOREIGN KEY (preferred_professional_id) REFERENCES professional_profiles(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  if (!await columnExists('appointment_holds', 'service_request_id')) await pool.query('ALTER TABLE appointment_holds ADD COLUMN service_request_id BIGINT UNSIGNED NULL AFTER id');
  if (!await constraintExists('fk_hold_request')) await pool.query('ALTER TABLE appointment_holds ADD CONSTRAINT fk_hold_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id)');
  if (!await columnExists('appointments', 'service_request_id')) await pool.query('ALTER TABLE appointments ADD COLUMN service_request_id BIGINT UNSIGNED NULL AFTER service_id');
  if (!await constraintExists('fk_appointment_request')) await pool.query('ALTER TABLE appointments ADD CONSTRAINT fk_appointment_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id)');

  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,type VARCHAR(64) NOT NULL,
    title VARCHAR(180) NOT NULL,message VARCHAR(1000) NOT NULL,action_url VARCHAR(500) NULL,read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (id),KEY idx_notification_user (user_id,read_at,created_at),
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_receipts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,order_id BIGINT UNSIGNED NOT NULL,uploader_user_id BIGINT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,mime_type VARCHAR(100) NOT NULL,size_bytes INT UNSIGNED NOT NULL,file_data MEDIUMBLOB NOT NULL,
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',reviewed_by BIGINT UNSIGNED NULL,reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (id),UNIQUE KEY uq_receipt_order (order_id),
    CONSTRAINT fk_receipt_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_receipt_uploader FOREIGN KEY (uploader_user_id) REFERENCES users(id),
    CONSTRAINT fk_receipt_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  if (!await columnExists('payments', 'payment_method')) await pool.query("ALTER TABLE payments ADD COLUMN payment_method VARCHAR(32) NOT NULL DEFAULT 'provider_checkout' AFTER provider");
  if (!await columnExists('payments', 'reference_currency')) await pool.query('ALTER TABLE payments ADD COLUMN reference_currency CHAR(3) NULL AFTER amount_minor');
  if (!await columnExists('payments', 'reference_amount_minor')) await pool.query('ALTER TABLE payments ADD COLUMN reference_amount_minor BIGINT UNSIGNED NULL AFTER reference_currency');

  await pool.query(`CREATE TABLE IF NOT EXISTS clinical_record_progress (
    appointment_id BIGINT UNSIGNED NOT NULL,status ENUM('not_started','intake_pending','in_progress','follow_up','closed') NOT NULL DEFAULT 'not_started',
    updated_by BIGINT UNSIGNED NOT NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (appointment_id),CONSTRAINT fk_clinical_progress_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_clinical_progress_actor FOREIGN KEY (updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS subscription_plans (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,product_id BIGINT UNSIGNED NOT NULL,name VARCHAR(180) NOT NULL,
    currency CHAR(3) NOT NULL,amount_minor BIGINT UNSIGNED NOT NULL,interval_unit ENUM('month','year') NOT NULL,interval_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),KEY idx_subscription_plan_product (product_id,active),CONSTRAINT fk_subscription_plan_product FOREIGN KEY (product_id) REFERENCES products(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,public_id CHAR(36) NOT NULL,user_id BIGINT UNSIGNED NOT NULL,plan_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','active','past_due','cancelled','expired') NOT NULL DEFAULT 'pending',provider VARCHAR(32) NULL,
    provider_subscription_id VARCHAR(128) NULL,current_period_start DATETIME NULL,current_period_end DATETIME NULL,cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),UNIQUE KEY uq_subscription_public (public_id),UNIQUE KEY uq_subscription_provider (provider,provider_subscription_id),
    KEY idx_subscription_user (user_id,status),CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
  ) ENGINE=InnoDB`);
  console.log('Migración P25 aplicada correctamente.');
}

migrate().catch(error => { console.error('No se pudo aplicar P25:', error.message); process.exitCode = 1; }).finally(() => pool.end());
