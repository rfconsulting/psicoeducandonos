const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, CAPABILITIES, hasCapability } = require('../src/constants/access');
const { pagination, page } = require('../src/utils/pagination');
const { isPasswordChangeRoute, isMfaBootstrapRoute } = require('../src/middleware/security');

test('aplica capacidades por rol', () => {
  assert.equal(hasCapability(ROLES.WRITER, CAPABILITIES.ARTICLE_CREATE), true);
  assert.equal(hasCapability(ROLES.WRITER, CAPABILITIES.COURSE_CREATE), false);
  assert.equal(hasCapability(ROLES.TEACHER, CAPABILITIES.STUDENT_TRACK), true);
  assert.equal(hasCapability(ROLES.ADMINISTRATOR, CAPABILITIES.USER_ROLE_CHANGE), false);
  assert.equal(hasCapability(ROLES.SUPERUSER, CAPABILITIES.USER_ROLE_CHANGE), true);
  assert.equal(hasCapability(ROLES.SUPERUSER, CAPABILITIES.AUDIT_VIEW), true);
  assert.equal(hasCapability(ROLES.ADMINISTRATOR, CAPABILITIES.AUDIT_VIEW), false);
  assert.equal(hasCapability(ROLES.SUPERUSER, CAPABILITIES.USER_PASSWORD_RESET), true);
  assert.equal(hasCapability(ROLES.ADMINISTRATOR, CAPABILITIES.USER_PASSWORD_RESET), false);
  assert.equal(hasCapability(ROLES.ADMINISTRATOR, CAPABILITIES.APPLICATION_MANAGE), true);
  assert.equal(hasCapability(ROLES.TEACHER, CAPABILITIES.APPLICATION_MANAGE), false);
});

test('limita y valida paginación por cursor', () => {
  assert.deepEqual(pagination({ limit: '500', cursor: '42' }), { limit: 100, cursor: 42 });
  assert.deepEqual(pagination({ limit: '-5', cursor: 'invalid' }), { limit: 1, cursor: null });
  assert.equal(page([{ id: 10 }, { id: 9 }], 2).nextCursor, 9);
  assert.equal(page([{ id: 10 }], 2).nextCursor, null);
});

test('permite cambiar una contraseña temporal antes del desafío MFA', () => {
  assert.equal(isPasswordChangeRoute('/api/auth/change-password'), true);
  assert.equal(isMfaBootstrapRoute('/api/auth/change-password'), true);
  assert.equal(isMfaBootstrapRoute('/api/users'), false);
  assert.equal(isMfaBootstrapRoute('/dashboard.html'), false);
});
