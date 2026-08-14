const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { catalogAvailability } = require('../src/services/course-enrollment');

test('catálogo habilita únicamente cursos gratuitos según política', () => {
  assert.deepEqual(catalogAvailability({ accessType: 'free', enrollmentPolicy: 'open' }), { code: 'available', canSelfEnroll: true });
  assert.equal(catalogAvailability({ accessType: 'paid', enrollmentPolicy: 'open' }).code, 'payment_unavailable');
  assert.equal(catalogAvailability({ accessType: 'free', enrollmentPolicy: 'admin_only' }).code, 'admin_only');
  assert.equal(catalogAvailability({ accessType: 'free', enrollmentPolicy: 'approved_students' }).code, 'approval_required');
  assert.equal(catalogAvailability({ accessType: 'free', enrollmentPolicy: 'approved_students' }, { approved: true }).canSelfEnroll, true);
});

test('una matrícula activa vuelve idempotente la disponibilidad', () => {
  assert.deepEqual(catalogAvailability({ accessType: 'free', enrollmentPolicy: 'open' }, { enrolled: true }), { code: 'enrolled', canSelfEnroll: false });
});

test('la autoinscripción usa transacción, bloqueo y fuente trazable', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/learning.js'), 'utf8');
  assert.match(source, /self-enrollment/);
  assert.match(source, /LIMIT 1 FOR UPDATE/);
  assert.match(source, /enrollment_source='free_self'/);
  assert.match(source, /student_self_enrolled/);
});
