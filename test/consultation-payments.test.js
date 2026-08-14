const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const commerce = fs.readFileSync(path.join(__dirname, '../src/routes/commerce.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../scripts/migrate-p14.js'), 'utf8');

test('checkout de consulta bloquea hold, precio y propiedad en servidor', () => {
  assert.match(commerce, /consultation-holds\/:holdId\/checkout/);
  assert.match(commerce, /h\.client_user_id=\?/);
  assert.match(commerce, /h\.expires_at>UTC_TIMESTAMP\(\)/);
  assert.match(commerce, /pp\.id=\?.*FOR UPDATE/s);
});

test('hold se convierte atómicamente en cita pendiente y orden', () => {
  assert.match(commerce, /INSERT INTO appointments/);
  assert.match(commerce, /'pending_payment'/);
  assert.match(commerce, /DELETE FROM appointment_holds WHERE id=\?/);
  assert.match(migration, /uq_appointment_hold/);
});

test('solo webhook confirmado entrega cita vigente', () => {
  assert.match(commerce, /appointment\?\.status === 'pending_payment'/);
  assert.match(commerce, /paymentExpiresAt/);
  assert.match(commerce, /SET status='confirmed'/);
  assert.match(commerce, /payment_delivery_failed/);
});

test('rechazo o cancelación de pago no confirma la cita', () => {
  assert.match(commerce, /eventStatus !== 'approved'/);
  assert.match(commerce, /SET status='expired'.*status='pending_payment'/s);
});
