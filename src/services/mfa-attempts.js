const MAX_MFA_FAILURES = 5;
const MFA_BLOCK_MS = 10 * 60 * 1000;

function resetMfaAttempts(session) {
  delete session.mfaAttemptUserId;
  delete session.mfaAttemptCount;
  delete session.mfaBlockedUntil;
}

function mfaChallengeAvailable(session, userId, now = Date.now()) {
  if (Number(session.mfaAttemptUserId) !== Number(userId)) resetMfaAttempts(session);
  const blockedUntil = Number(session.mfaBlockedUntil || 0);
  if (blockedUntil && blockedUntil <= now) {
    resetMfaAttempts(session);
    return true;
  }
  return blockedUntil === 0;
}

function recordMfaFailure(session, userId, now = Date.now()) {
  if (Number(session.mfaAttemptUserId) !== Number(userId)) resetMfaAttempts(session);
  session.mfaAttemptUserId = Number(userId);
  session.mfaAttemptCount = Number(session.mfaAttemptCount || 0) + 1;
  if (session.mfaAttemptCount >= MAX_MFA_FAILURES) {
    session.mfaAttemptCount = 0;
    session.mfaBlockedUntil = now + MFA_BLOCK_MS;
    return { limited: true, blockedUntil: session.mfaBlockedUntil };
  }
  return { limited: false, remaining: MAX_MFA_FAILURES - session.mfaAttemptCount };
}

module.exports = {
  MAX_MFA_FAILURES,
  MFA_BLOCK_MS,
  resetMfaAttempts,
  mfaChallengeAvailable,
  recordMfaFailure
};
