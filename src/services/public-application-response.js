const crypto = require('node:crypto');

const PUBLIC_APPLICATION_STATUS = 202;
const PUBLIC_APPLICATION_MIN_MS = 200;
const PUBLIC_APPLICATION_MESSAGE = 'Si los datos son válidos, la postulación será procesada. Recibirás información por correo cuando corresponda.';

function publicApplicationResult() {
  return {
    status: PUBLIC_APPLICATION_STATUS,
    body: { message: PUBLIC_APPLICATION_MESSAGE }
  };
}

function publicApplicationDelay(elapsedMs, jitterMs = 0) {
  return Math.max(0, PUBLIC_APPLICATION_MIN_MS + jitterMs - Math.max(0, elapsedMs));
}

async function waitForEquivalentPublicResponse(startedAt, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const elapsedMs = Date.now() - startedAt;
  const jitterMs = crypto.randomInt(0, 31);
  await sleep(publicApplicationDelay(elapsedMs, jitterMs));
}

module.exports = {
  PUBLIC_APPLICATION_STATUS,
  PUBLIC_APPLICATION_MIN_MS,
  publicApplicationResult,
  publicApplicationDelay,
  waitForEquivalentPublicResponse
};
