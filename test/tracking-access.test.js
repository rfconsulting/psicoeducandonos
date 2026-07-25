const test = require('node:test');
const assert = require('node:assert/strict');
const { CAPABILITIES, hasCapability } = require('../src/constants/access');
const { isSessionUserCurrent } = require('../src/middleware/security');
const {
  canAccessStudentTracking,
  listEnrollmentCandidates
} = require('../src/services/tracking-access');

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    async execute(sql, values = []) {
      calls.push({ sql, values });
      return [rows];
    }
  };
}

test('profesor accede al seguimiento de un estudiante de un curso propio', async () => {
  const db = fakeDb([{ id: 21 }]);
  const allowed = await canAccessStudentTracking(db, { id: 7, role: 'teacher' }, 21);
  assert.equal(allowed, true);
  assert.match(db.calls[0].sql, /c\.creator_id=\?/);
  assert.deepEqual(db.calls[0].values, [21, 7]);
});

test('profesor no conoce ni modifica el seguimiento de un estudiante ajeno', async () => {
  const db = fakeDb([]);
  const allowed = await canAccessStudentTracking(db, { id: 7, role: 'teacher' }, 99);
  assert.equal(allowed, false);
});

test('administrador conserva alcance global de seguimiento', async () => {
  const db = fakeDb([{ id: 99 }]);
  const allowed = await canAccessStudentTracking(db, { id: 2, role: 'administrator' }, 99);
  assert.equal(allowed, true);
  assert.doesNotMatch(db.calls[0].sql, /course_enrollments/);
  assert.deepEqual(db.calls[0].values, [99]);
});

test('un usuario sin capacidad no puede entrar al flujo de seguimiento', () => {
  assert.equal(hasCapability('writer', CAPABILITIES.STUDENT_TRACK), false);
  assert.equal(hasCapability('student', CAPABILITIES.STUDENT_TRACK), false);
});

test('una sesión de usuario suspendido deja de ser válida', () => {
  const sessionUser = { role: 'teacher', authVersion: 3 };
  assert.equal(isSessionUserCurrent(sessionUser, { role: 'teacher', status: 'active', auth_version: 3 }), true);
  assert.equal(isSessionUserCurrent(sessionUser, { role: 'teacher', status: 'suspended', auth_version: 3 }), false);
});

test('administrador recibe candidatos globales con datos mínimos', async () => {
  const db = fakeDb([{ id: 1, fullName: 'Ana' }]);
  const candidates = await listEnrollmentCandidates(db, { id: 2, role: 'administrator' });
  assert.deepEqual(candidates, [{ id: 1, fullName: 'Ana' }]);
  assert.doesNotMatch(db.calls[0].sql, /email/i);
  assert.match(db.calls[0].sql, /status='active'/);
});

test('profesor recibe solo candidatos vinculados con sus cursos y sin correo', async () => {
  const db = fakeDb([{ id: 4, fullName: 'Luis' }]);
  const candidates = await listEnrollmentCandidates(db, { id: 7, role: 'teacher' });
  assert.deepEqual(candidates, [{ id: 4, fullName: 'Luis' }]);
  assert.match(db.calls[0].sql, /c\.creator_id=\?/);
  assert.doesNotMatch(db.calls[0].sql, /email/i);
  assert.deepEqual(db.calls[0].values, [7]);
});
