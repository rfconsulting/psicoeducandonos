const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  generateVerificationToken,
  hashVerificationToken,
  isVerificationToken,
  genericRegistrationResponse,
  genericResendResponse
} = require('../src/services/email-verification-token');
const { publicAuthDelay } = require('../src/services/public-auth-response');

test('genera tokens de verificación de 32 bytes y almacena solo SHA-256', () => {
  const token = generateVerificationToken();
  const hash = hashVerificationToken(token);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(isVerificationToken(token), true);
  assert.equal(isVerificationToken('incorrecto'), false);
});

test('registro duplicado y reenvío usan respuestas no enumerativas', () => {
  assert.doesNotMatch(genericRegistrationResponse().message, /existe|registrado|duplicado/i);
  assert.doesNotMatch(genericResendResponse().message, /no existe|verificado previamente/i);
  assert.equal(publicAuthDelay(10, 0), 290);
  assert.equal(publicAuthDelay(500, 0), 0);
});

test('el contrato HTTP exige CSRF, transacción, token de un uso y auditoría', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8');
  assert.match(source, /router\.post\('\/register', verifyCsrf/);
  assert.match(source, /router\.post\('\/verification\/resend', verifyCsrf/);
  assert.match(source, /router\.post\('\/verify-email', verifyCsrf/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /email_verified_at=UTC_TIMESTAMP\(\)/);
  assert.match(source, /email_verification_tokens SET used_at=UTC_TIMESTAMP\(\)/);
  assert.match(source, /public_registration_created/);
  assert.match(source, /email_verified/);
});

test('registro y verificación reemplazan el formulario público legado', () => {
  const publicRoot = path.join(__dirname, '..', 'public');
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.equal(fs.existsSync(path.join(publicRoot, 'registro.html')), true);
  assert.equal(fs.existsSync(path.join(publicRoot, 'verificar-email.html')), true);
  assert.equal(fs.existsSync(path.join(publicRoot, 'postulacion.html')), false);
  assert.match(server, /app\.post\('\/api\/applications'.*status\(404\)/);
});
