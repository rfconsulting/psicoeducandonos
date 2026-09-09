CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('superuser','administrator','writer','teacher','student') NOT NULL DEFAULT 'student',
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  registration_source ENUM('admin','application','public','legacy') NOT NULL DEFAULT 'legacy',
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at DATETIME NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_encrypted TEXT NULL,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  password_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_hash (token_hash),
  KEY idx_password_reset_user (user_id),
  KEY idx_password_reset_expiry (expires_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verification_hash (token_hash),
  KEY idx_email_verification_user (user_id),
  KEY idx_email_verification_expiry (expires_at),
  CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id BIGINT UNSIGNED NULL,
  ip_address VARCHAR(45) NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  summary VARCHAR(320) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  pdf_url VARCHAR(1000) NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_articles_slug (slug),
  KEY idx_articles_status_date (status, published_at),
  CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  creator_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  access_type ENUM('free','paid') NOT NULL DEFAULT 'free',
  enrollment_policy ENUM('open','approved_students','admin_only') NOT NULL DEFAULT 'admin_only',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_slug (slug),
  KEY idx_courses_status_date (status, published_at),
  CONSTRAINT fk_courses_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_tracking (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stage ENUM('not_started','in_progress','completed','paused') NOT NULL DEFAULT 'not_started',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tracking_student (student_id),
  CONSTRAINT chk_tracking_progress CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT fk_tracking_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tracking_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS course_modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_module_position (course_id, position),
  CONSTRAINT fk_module_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lessons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  estimated_minutes SMALLINT UNSIGNED NULL,
  video_url VARCHAR(500) NOT NULL,
  pdf_url VARCHAR(500) NOT NULL,
  slides_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_module_lesson_position (module_id, position),
  CONSTRAINT fk_lesson_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professional_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL,
  professional_type ENUM('psychologist','counselor') NOT NULL, license_number VARCHAR(80) NULL, specialties VARCHAR(500) NULL, bio TEXT NULL,
  timezone VARCHAR(64) NOT NULL, status ENUM('draft','active','suspended') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_professional_user (user_id), KEY idx_professional_status (status),
  CONSTRAINT fk_professional_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professional_services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, professional_id BIGINT UNSIGNED NOT NULL,
  service_type ENUM('psychology','counseling') NOT NULL, name VARCHAR(180) NOT NULL, description TEXT NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_services_professional (professional_id,active),
  CONSTRAINT fk_service_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT chk_service_duration CHECK (duration_minutes BETWEEN 15 AND 240)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, course_id BIGINT UNSIGNED NULL, service_id BIGINT UNSIGNED NULL, name VARCHAR(180) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_products_course (course_id), UNIQUE KEY uq_products_service (service_id),
  CONSTRAINT fk_product_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, product_id BIGINT UNSIGNED NOT NULL, currency CHAR(3) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_product_prices_active (product_id,active,currency),
  CONSTRAINT fk_price_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT chk_price_positive CHECK (amount_minor > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, buyer_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','processing','paid','cancelled','expired','partially_refunded','refunded') NOT NULL DEFAULT 'pending',
  currency CHAR(3) NOT NULL, total_minor BIGINT UNSIGNED NOT NULL, paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_orders_public (public_id), KEY idx_orders_buyer (buyer_user_id,created_at),
  CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(180) NOT NULL, unit_amount_minor BIGINT UNSIGNED NOT NULL, quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id), KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_item_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id BIGINT UNSIGNED NOT NULL, provider VARCHAR(32) NOT NULL,
  provider_checkout_id VARCHAR(128) NULL, provider_payment_id VARCHAR(128) NULL, status ENUM('pending','approved','rejected','cancelled','refunded') NOT NULL DEFAULT 'pending',
  currency CHAR(3) NOT NULL, amount_minor BIGINT UNSIGNED NOT NULL, approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_payment_provider_id (provider,provider_payment_id), KEY idx_payments_order (order_id),
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, payment_id BIGINT UNSIGNED NULL, provider VARCHAR(32) NOT NULL,
  provider_event_id VARCHAR(128) NOT NULL, event_type VARCHAR(64) NOT NULL, payload_hash CHAR(64) NOT NULL,
  processing_status ENUM('processed','ignored','failed') NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_payment_event (provider,provider_event_id),
  CONSTRAINT fk_payment_event_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS availability_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, professional_id BIGINT UNSIGNED NOT NULL,
  weekday ENUM('sun','mon','tue','wed','thu','fri','sat') NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id), KEY idx_availability_professional (professional_id,weekday,active),
  CONSTRAINT fk_availability_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE,
  CONSTRAINT chk_availability_range CHECK (end_time > start_time)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, professional_id BIGINT UNSIGNED NOT NULL, exception_date DATE NOT NULL,
  start_time TIME NOT NULL, end_time TIME NOT NULL, exception_type ENUM('blocked','available') NOT NULL,
  PRIMARY KEY (id), KEY idx_exception_professional_date (professional_id,exception_date),
  CONSTRAINT fk_exception_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointment_holds (
  id CHAR(36) NOT NULL, professional_id BIGINT UNSIGNED NOT NULL, service_id BIGINT UNSIGNED NOT NULL, client_user_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL, end_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_hold_professional_start (professional_id,start_at), KEY idx_holds_expiry (expires_at),
  CONSTRAINT fk_hold_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hold_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hold_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, hold_reference CHAR(36) NULL, professional_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL, client_user_id BIGINT UNSIGNED NOT NULL, start_at DATETIME NOT NULL, end_at DATETIME NOT NULL,
  timezone VARCHAR(64) NOT NULL, status ENUM('held','pending_payment','confirmed','completed','expired','cancelled_by_client','cancelled_by_professional','no_show','refunded') NOT NULL DEFAULT 'held',
  order_id BIGINT UNSIGNED NULL, payment_expires_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_appointment_public (public_id), UNIQUE KEY uq_appointment_hold (hold_reference), KEY idx_appointment_professional (professional_id,start_at), KEY idx_appointment_client (client_user_id,start_at),
  CONSTRAINT fk_appointment_professional FOREIGN KEY (professional_id) REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_service FOREIGN KEY (service_id) REFERENCES professional_services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, appointment_id BIGINT UNSIGNED NOT NULL, actor_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) NOT NULL, old_start_at DATETIME NULL, new_start_at DATETIME NULL, details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_appointment_events (appointment_id,id),
  CONSTRAINT fk_appointment_event_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointment_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS course_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  enrolled_by BIGINT UNSIGNED NOT NULL,
  enrollment_source ENUM('legacy','admin','free_self','paid') NOT NULL DEFAULT 'legacy',
  order_id BIGINT UNSIGNED NULL,
  status ENUM('active','completed','withdrawn') NOT NULL DEFAULT 'active',
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_student (course_id, student_id),
  KEY idx_enrollment_student_status (student_id, status),
  CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_actor FOREIGN KEY (enrolled_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_enrollment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enrollment_support_tracking (
  enrollment_id BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  supervision_completed BOOLEAN NOT NULL DEFAULT FALSE,
  supervision_notes TEXT NULL,
  practice_completed BOOLEAN NOT NULL DEFAULT FALSE,
  practice_notes TEXT NULL,
  personal_work_completed BOOLEAN NOT NULL DEFAULT FALSE,
  personal_work_notes TEXT NULL,
  -- Compatibilidad temporal para despliegues anteriores a P7.
  therapy_attendance BOOLEAN NOT NULL DEFAULT FALSE,
  therapy_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id),
  CONSTRAINT fk_support_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
  CONSTRAINT fk_support_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lesson_progress (
  enrollment_id BIGINT UNSIGNED NOT NULL,
  lesson_id BIGINT UNSIGNED NOT NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id, lesson_id),
  KEY idx_progress_lesson (lesson_id),
  CONSTRAINT fk_progress_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  age_range ENUM('18-25','26-40','41-60','61-plus') NOT NULL,
  location VARCHAR(160) NOT NULL,
  pathway ENUM('accompaniment','health-professional') NOT NULL,
  crisis_experience BOOLEAN NOT NULL,
  motivation TEXT NOT NULL,
  referral_source ENUM('instagram','facebook','whatsapp','acquaintance','other') NOT NULL,
  privacy_consent BOOLEAN NOT NULL,
  supervision_commitment BOOLEAN NOT NULL,
  newsletter_consent BOOLEAN NOT NULL DEFAULT FALSE,
  attended_info_session BOOLEAN NULL,
  session_feedback TEXT NULL,
  status ENUM('pending','reviewing','approved','waitlisted','rejected') NOT NULL DEFAULT 'pending',
  review_notes TEXT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_applications_status_created (status, created_at),
  KEY idx_applications_email (email),
  KEY idx_applications_reviewer (reviewed_by),
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS module_certification_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id BIGINT UNSIGNED NOT NULL,
  area ENUM('supervision','practice','personal_work') NOT NULL,
  question_text VARCHAR(2000) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_module_certification_area (module_id,area),
  CONSTRAINT fk_module_certification_question_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_certification_question_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS module_certification_records (
  enrollment_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  area ENUM('supervision','practice','personal_work') NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  answer_text TEXT NULL,
  answer_status ENUM('pending','submitted','changes_requested','reviewed') NOT NULL DEFAULT 'pending',
  certified BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_observation TEXT NULL,
  submitted_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id,module_id,area),
  KEY idx_module_certification_records_module (module_id),
  KEY idx_module_certification_records_question (question_id),
  CONSTRAINT fk_module_certification_record_enrollment FOREIGN KEY (enrollment_id) REFERENCES course_enrollments(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_certification_record_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_certification_record_question FOREIGN KEY (question_id) REFERENCES module_certification_questions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_module_certification_record_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  phone VARCHAR(40) NULL,
  country VARCHAR(80) NULL,
  province VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  birth_date DATE NULL,
  document_type ENUM('national_id','passport','other') NULL,
  document_number VARCHAR(80) NULL,
  profession VARCHAR(120) NULL,
  education_level ENUM('secondary','technical','university','postgraduate','other') NULL,
  specialization VARCHAR(160) NULL,
  institution VARCHAR(180) NULL,
  license_number VARCHAR(80) NULL,
  years_experience TINYINT UNSIGNED NULL,
  pathway ENUM('accompaniment','health-professional','undecided') NULL,
  motivation TEXT NULL,
  bio TEXT NULL,
  review_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_student_profiles_review (review_status, submitted_at),
  CONSTRAINT fk_student_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profile_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_profile_user_id BIGINT UNSIGNED NOT NULL,
  consent_type ENUM('privacy','data_accuracy') NOT NULL,
  version VARCHAR(32) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_consent_version (student_profile_user_id, consent_type, version),
  CONSTRAINT fk_student_consent_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profile_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_profile_user_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('identity','professional_license','other') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_documents_profile (student_profile_user_id, status),
  UNIQUE KEY uq_student_document_storage (storage_key),
  CONSTRAINT fk_student_document_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profile_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_profile_user_id BIGINT UNSIGNED NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL,
  decision ENUM('start_review','request_changes','approve','reject','reopen') NOT NULL,
  to_status ENUM('draft','submitted','under_review','changes_requested','approved','rejected') NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_profile_reviews_profile (student_profile_user_id, id),
  KEY idx_profile_reviews_reviewer (reviewer_user_id, created_at),
  CONSTRAINT fk_profile_review_profile FOREIGN KEY (student_profile_user_id) REFERENCES student_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_review_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
