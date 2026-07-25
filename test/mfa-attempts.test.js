const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_MFA_FAILURES,
  MFA_BLOCK_MS,
  resetMfaAttempts,
  mfaChallengeAvailable,
  recordMfaFailure
} = require('../src/services/mfa-attempts');

test('limita el desafío MFA por sesión y usuario después de cinco fallos', () => {
  const session = {};
  for (let attempt = 1; attempt < MAX_MFA_FAILURES; attempt += 1) {
    assert.equal(recordMfaFailure(session, 7, 1000).limited, false);
  }
  const limited = recordMfaFailure(session, 7, 1000);
  assert.equal(limited.limited, true);
  assert.equal(mfaChallengeAvailable(session, 7, 1001), false);
  assert.equal(session.mfaAttemptUserId, 7);
});

test('el límite MFA expira sin bloquear permanentemente al usuario', () => {
  const session = {};
  for (let attempt = 0; attempt < MAX_MFA_FAILURES; attempt += 1) {
    recordMfaFailure(session, 7, 2000);
  }
  assert.equal(mfaChallengeAvailable(session, 7, 2000 + MFA_BLOCK_MS - 1), false);
  assert.equal(mfaChallengeAvailable(session, 7, 2000 + MFA_BLOCK_MS), true);
  assert.equal(session.mfaBlockedUntil, undefined);
});

test('un éxito reinicia el contador y un usuario distinto no hereda fallos', () => {
  const session = {};
  recordMfaFailure(session, 7);
  recordMfaFailure(session, 7);
  resetMfaAttempts(session);
  assert.equal(mfaChallengeAvailable(session, 7), true);
  assert.equal(session.mfaAttemptCount, undefined);

  recordMfaFailure(session, 7);
  assert.equal(mfaChallengeAvailable(session, 8), true);
  assert.equal(session.mfaAttemptUserId, undefined);
});
