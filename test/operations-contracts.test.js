const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('P25 conserva catálogo, comprobantes, notificaciones, progreso y suscripciones', () => {
  const migration = read('scripts/migrate-p25.js');
  for (const table of ['service_type_catalog','professional_service_authorizations','service_requests','notifications','payment_receipts','clinical_record_progress','subscription_plans','subscriptions']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /payment_method/);
  assert.match(migration, /reference_currency/);
});

test('la API protege escrituras operativas con autenticación, capacidad y CSRF', () => {
  const route = read('src/routes/operations.js');
  assert.match(route, /authorizations'.*requireCapability\(CAPABILITIES\.SCHEDULING_MANAGE\), verifyCsrf/s);
  assert.match(route, /receipt'.*requireAuth, verifyCsrf/s);
  assert.match(route, /clinical-progress'.*requireCapability\(CAPABILITIES\.SCHEDULING_MANAGE\), verifyCsrf/s);
  assert.match(route, /subscriptions'.*requireRole\('student'\), verifyCsrf/s);
  assert.match(route, /detectReceiptMime/);
  assert.match(route, /mime !== declaredMime/);
  assert.match(route, /paymentMethod[\s\S]*referenceCurrency/);
});

test('el cliente estudiantil envía JSON en las operaciones manuales', () => {
  const client = read('public/estudiante.js');
  assert.match(client, /options\.body\?\{'content-type':'application\/json'\}/);
  assert.match(client, /Transferencia \/ ACH/);
  assert.match(client, /operations\/courses\/\$\{item\.id\}\/manual-order/);
  assert.match(client, /operations\/consultation-holds\/\$\{hold\.id\}\/manual-order/);
});

test('el estudiante dispone de menús separados para pagos y notificaciones', () => {
  const html = read('public/estudiante.html');
  const commerce = read('src/routes/commerce.js');
  assert.match(html, /data-panel-target="payments-panel"/);
  assert.match(html, /data-panel-target="notifications-panel"/);
  assert.match(html, /id="student-payments-list"/);
  assert.match(html, /id="student-payment-status"/);
  assert.match(html, /value="pending">Pendientes/);
  assert.match(read('public/estudiante.js'), /function paymentStatusGroup/);
  assert.match(commerce, /router\.get\('\/orders\/my', requireRole\('student'\)/);
  assert.match(commerce, /router\.delete\('\/orders\/:reference', requireRole\('student'\), verifyCsrf/);
  assert.match(commerce, /order_cancelled_by_student/);
  assert.match(commerce, /order\.provider !== 'paypal'/);
  assert.match(commerce, /La orden de PayPal fue cancelada/);
  assert.match(commerce, /payment_receipts/);
});

test('las acciones gratuitas y de transferencia se presentan como botones completos', () => {
  const css = read('public/auth.css');
  assert.match(css, /#courses-list \.content-card>button\.content-link\.blocked-course-link:not\(:disabled\)/);
  assert.match(css, /#courses-list \.content-card>button\.small-button\.secondary-button/);
  assert.match(css, /min-height: 46px/);
});

test('el pago USD identifica visualmente a PayPal', () => {
  const client = read('public/estudiante.js');
  const css = read('public/auth.css');
  assert.match(client, /Pagar con PayPal · USD/);
  assert.match(client, /classList\.add\('paypal-button'\)/);
  assert.match(css, /\.course-pay-button\.paypal-button/);
  assert.match(css, /#0070ba/);
  assert.match(css, /#ffc439/);
});

test('el profesional tiene una vista privada de consultas pendientes', () => {
  const scheduling = read('src/routes/scheduling.js');
  const html = read('public/dashboard.html');
  assert.match(scheduling, /professional\/appointments\/pending', requireAuth/);
  assert.match(scheduling, /WHERE user_id=\? AND status='active' AND credential_status='verified'/);
  assert.match(scheduling, /a\.professional_id=\? AND a\.status IN \('pending_payment','confirmed'\)/);
  assert.match(html, /data-panel-target="professional-consultations-section"/);
  assert.match(html, /Mis consultas pendientes/);
});

test('la descarga del comprobante conserva una extensión reconocible', () => {
  const route = read('src/routes/operations.js');
  assert.match(route, /'image\/jpeg': 'jpg'/);
  assert.match(route, /'application\/pdf': 'pdf'/);
  assert.match(route, /`comprobante-\$\{id\}\.\$\{extension\}`/);
  assert.match(route, /X-Content-Type-Options', 'nosniff'/);
});

test('el progreso clínico guarda solo estado administrativo y no notas clínicas', () => {
  const migration = read('scripts/migrate-p25.js');
  const table = migration.match(/CREATE TABLE IF NOT EXISTS clinical_record_progress[\s\S]*?ENGINE=InnoDB/)[0];
  assert.doesNotMatch(table, /diagnosis|clinical_notes|therapy_notes|observation|notes/i);
});

test('el artefacto productivo incluye P24, P25 y el trabajo de notificaciones', () => {
  const build = read('scripts/build-hostinger-archive.js');
  assert.match(build, /'migrate-p24\.js'/);
  assert.match(build, /'migrate-p25\.js'/);
  assert.match(build, /'notify-pending-consultations\.js'/);
});
