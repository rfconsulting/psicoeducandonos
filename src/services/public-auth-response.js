const crypto = require('node:crypto');

const PUBLIC_AUTH_MIN_MS = 300;

function publicAuthDelay(elapsedMs, jitterMs = 0) {
  return Math.max(0, PUBLIC_AUTH_MIN_MS + jitterMs - Math.max(0, elapsedMs));
}

async function waitForEquivalentAuthResponse(startedAt, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  await sleep(publicAuthDelay(Date.now() - startedAt, crypto.randomInt(0, 31)));
}

module.exports = { PUBLIC_AUTH_MIN_MS, publicAuthDelay, waitForEquivalentAuthResponse };
