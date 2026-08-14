const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { legacyProfileValues, missingProfileFields, fieldsToImport } = require('../src/services/legacy-student-migration');

test('precarga solamente datos compatibles del formulario legado', () => {
  assert.deepEqual(legacyProfileValues({ phone: ' 11  2222 ', location: ' Rosario ', pathway: 'accompaniment', motivation: ' Aprender ' }), {
    phone: '11 2222', city: 'Rosario', pathway: 'accompaniment', motivation: 'Aprender'
  });
});

test('respeta los limites del perfil al importar texto legado', () => {
  const values = legacyProfileValues({ phone: '1'.repeat(45), location: 'x'.repeat(120), motivation: 'm'.repeat(3100) });
  assert.equal(values.phone.length, 40);
  assert.equal(values.city.length, 100);
  assert.equal(values.motivation.length, 3000);
});

test('no sobrescribe datos actuales del estudiante', () => {
  const current = { phone: '+54 9 11', city: null, pathway: '', motivation: 'Propia' };
  const legacy = { phone: 'viejo', location: 'Cordoba', pathway: 'accompaniment', motivation: 'Vieja' };
  assert.deepEqual(fieldsToImport(current, legacy), ['city', 'pathway']);
});

test('mantiene visibles los campos obligatorios que faltan', () => {
  const missing = missingProfileFields({ phone: '1', city: 'Rosario', pathway: 'health-professional', motivation: 'M' });
  assert.deepEqual(missing, ['country', 'birth_date', 'document_type', 'document_number', 'profession', 'education_level', 'license_number']);
});

test('el comando es dry-run por defecto y no modifica contrasenas', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrate-legacy-students.js'), 'utf8');
  assert.match(source, /process\.argv\.includes\('--execute'\)/);
  assert.match(source, /connection\.rollback\(\)/);
  assert.doesNotMatch(source, /password_hash|DELETE FROM users|UPDATE users/);
  assert.match(source, /rejected_application/);
});
