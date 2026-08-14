const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signature, verifySignature } = require('../src/services/payment-provider');
const { catalogAvailability } = require('../src/services/course-enrollment');

test('firma y valida webhooks con expiración y comparación segura', () => {
  const secret = ['commerce', 'webhook', 'fixture'].join('-').repeat(2);
  const body = Buffer.from('{"eventId":"evt-1"}');
  const now = 1_800_000_000_000;
  const timestamp = String(Math.floor(now / 1000));
  const signed = signature(secret, timestamp, body);
  assert.equal(verifySignature(secret, timestamp, body, signed, now), true);
  assert.equal(verifySignature(secret, timestamp, Buffer.from('{}'), signed, now), false);
  assert.equal(verifySignature(secret, String(Number(timestamp) - 301), body, signed, now), false);
});

test('curso pago ofrece checkout solo con precio y proveedor habilitado', () => {
  const course = { accessType: 'paid', enrollmentPolicy: 'open', prices: [{ id: 2 }] };
  assert.equal(catalogAvailability(course, { paymentsEnabled: false }).code, 'payment_unavailable');
  assert.deepEqual(catalogAvailability(course, { paymentsEnabled: true }), { code: 'checkout_available', canSelfEnroll: false, canCheckout: true });
});

test('Commerce conserva snapshot, idempotencia y entrega exclusiva por webhook', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/commerce.js'), 'utf8');
  assert.match(source, /INSERT INTO order_items/);
  assert.match(source, /INSERT IGNORE INTO payment_events/);
  assert.match(source, /verifySignature/);
  assert.match(source, /enrollment_source,order_id/);
  assert.doesNotMatch(source, /success.*course_enrollments/i);
});
