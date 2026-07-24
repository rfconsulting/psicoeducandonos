const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateResetToken,
  hashResetToken,
  genericForgotPasswordResponse,
  isResetTokenUsable
} = require('../src/services/password-reset-token');

test('genera el token existente de 32 bytes y almacenable solo como SHA-256', () => {
  const token = generateResetToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.match(hashResetToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashResetToken(token), token);
});

test('respeta expiración y consumo de tokens', () => {
  const now = new Date('2026-07-23T20:00:00Z');
  assert.equal(isResetTokenUsable({ expiresAt: '2026-07-23T20:30:00Z', usedAt: null }, now), true);
  assert.equal(isResetTokenUsable({ expiresAt: '2026-07-23T20:00:00Z', usedAt: null }, now), false);
  assert.equal(isResetTokenUsable({ expiresAt: '2026-07-23T20:30:00Z', usedAt: now }, now), false);
});

test('la respuesta no permite enumerar si una cuenta existe', () => {
  assert.deepEqual(genericForgotPasswordResponse(), genericForgotPasswordResponse());
  assert.equal(Object.keys(genericForgotPasswordResponse()).length, 1);
});
