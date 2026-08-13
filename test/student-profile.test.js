const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { studentProfilePatch, completion, validAdultBirthDate } = require('../src/validation/student-profile');

test('normaliza un parche parcial sin exigir completar el perfil', () => {
  assert.deepEqual(studentProfilePatch({ phone: '  +507   6000 0000 ', country: ' Panamá ' }), {
    phone: '+507 6000 0000', country: 'Panamá'
  });
  assert.equal(studentProfilePatch({ yearsExperience: -1 }), null);
  assert.equal(studentProfilePatch({ pathway: 'inventado' }), null);
});

test('valida mayoría de edad con fecha real', () => {
  const now = new Date('2026-08-12T00:00:00Z');
  assert.equal(validAdultBirthDate('2008-08-12', now), true);
  assert.equal(validAdultBirthDate('2008-08-13', now), false);
  assert.equal(validAdultBirthDate('2020-02-31', now), false);
});

test('calcula completitud y exige licencia solo al profesional de salud', () => {
  const base = { phone: '1', country: 'PA', city: 'Panamá', birthDate: '1990-01-01', documentType: 'passport', documentNumber: 'X', profession: 'Consejero', educationLevel: 'university', pathway: 'accompaniment', motivation: 'Aprender' };
  assert.deepEqual(completion(base), { percentage: 100, complete: true, missingFields: [] });
  const professional = completion({ ...base, pathway: 'health-professional' });
  assert.equal(professional.complete, false);
  assert.deepEqual(professional.missingFields, ['licenseNumber']);
});

test('la API limita el perfil al estudiante y bloquea estados no editables', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'student-profile.js'), 'utf8');
  assert.match(source, /requireRole\('student'\)/);
  assert.match(source, /EDITABLE_STATES = new Set\(\['draft', 'changes_requested'\]\)/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /student_profile_submitted/);
  assert.doesNotMatch(source, /review_notes/);
});

test('la interfaz ofrece guardado y envío explícitos', () => {
  const root = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(root, 'estudiante.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'estudiante.js'), 'utf8');
  assert.match(html, /id="student-profile-form"/);
  assert.match(html, /id="profile-submit-form"/);
  assert.match(html, /Guardar avance/);
  assert.match(html, /Enviar perfil para validación/);
  assert.match(script, /\/api\/student-profile\/me/);
});
