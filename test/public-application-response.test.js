const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PUBLIC_APPLICATION_MIN_MS,
  publicApplicationResult,
  publicApplicationDelay
} = require('../src/services/public-application-response');

test('postulación nueva y existente producen el mismo estado y cuerpo público', () => {
  const newApplication = publicApplicationResult();
  const existingApplication = publicApplicationResult();
  assert.equal(newApplication.status, 202);
  assert.deepEqual(existingApplication, newApplication);
  assert.equal(Object.hasOwn(newApplication.body, 'id'), false);
  assert.doesNotMatch(newApplication.body.message, /existe|duplic|correo registrado/i);
});

test('iguala aproximadamente el tiempo observable de ambas ramas', () => {
  const newElapsedMs = 85;
  const duplicateElapsedMs = 8;
  const jitterMs = 12;
  const newTotal = newElapsedMs + publicApplicationDelay(newElapsedMs, jitterMs);
  const duplicateTotal = duplicateElapsedMs + publicApplicationDelay(duplicateElapsedMs, jitterMs);
  assert.equal(newTotal, PUBLIC_APPLICATION_MIN_MS + jitterMs);
  assert.equal(duplicateTotal, PUBLIC_APPLICATION_MIN_MS + jitterMs);
  assert.equal(Math.abs(newTotal - duplicateTotal) <= 5, true);
});

test('no agrega demora si el procesamiento ya superó el mínimo', () => {
  assert.equal(publicApplicationDelay(PUBLIC_APPLICATION_MIN_MS + 50, 10), 0);
});
