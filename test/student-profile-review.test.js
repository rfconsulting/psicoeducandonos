const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { reviewTransition } = require('../src/services/student-profile-review');

test('solo permite transiciones administrativas explícitas', () => {
  assert.deepEqual(reviewTransition('submitted', 'start_review', ''), {
    fromStatus: 'submitted', decision: 'start_review', toStatus: 'under_review', notes: null
  });
  assert.equal(reviewTransition('submitted', 'approve', ''), null);
  assert.equal(reviewTransition('approved', 'approve', ''), null);
});

test('cambios, rechazo y reapertura requieren una razón útil', () => {
  assert.equal(reviewTransition('under_review', 'request_changes', 'breve'), null);
  assert.equal(reviewTransition('under_review', 'reject', ''), null);
  assert.equal(reviewTransition('approved', 'reopen', 'sin razón'), null);
  assert.equal(reviewTransition('under_review', 'request_changes', 'Corrige el número profesional.').toStatus, 'changes_requested');
  assert.equal(reviewTransition('under_review', 'reject', 'Los datos no pudieron validarse.').toStatus, 'rejected');
});

test('la decisión bloquea el perfil y persiste historial y auditoría juntos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'student-profile-reviews.js'), 'utf8');
  assert.match(source, /requireCapability\(CAPABILITIES\.STUDENT_PROFILE_REVIEW\)/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /INSERT INTO student_profile_reviews/);
  assert.match(source, /student_profile_reviewed/);
  assert.match(source, /required: true/);
});

test('el estudiante recibe decisiones sin identidad del revisor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'student-profile.js'), 'utf8');
  const history = source.slice(source.indexOf('SELECT decision,to_status'), source.indexOf('return res.json', source.indexOf('SELECT decision,to_status')));
  assert.match(history, /notes/);
  assert.doesNotMatch(history, /reviewer_user_id|reviewerName|full_name/);
});

test('requireApprovedStudent consulta el estado vigente en servidor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware', 'security.js'), 'utf8');
  assert.match(source, /function requireApprovedStudent/);
  assert.match(source, /review_status='approved'/);
  assert.match(source, /STUDENT_APPROVAL_REQUIRED/);
});
