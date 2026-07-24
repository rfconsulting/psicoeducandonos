const test = require('node:test');
const assert = require('node:assert/strict');
const EmailService = require('../src/services/email/email-service');
const ResendEmailProvider = require('../src/services/email/resend-email-provider');
const { EmailDeliveryError } = require('../src/services/email/errors');

const token = 'a'.repeat(64);

test('envía recuperación en HTML y texto mediante un proveedor falso', async () => {
  const sent = [];
  const service = new EmailService({
    provider: { send: async message => sent.push(message) },
    from: 'Psicoeducándonos <cuentas@example.org>',
    appPublicUrl: 'https://psicoeducandonos.org'
  });
  assert.equal(await service.sendPasswordReset({ to: 'persona@example.net', token }), true);
  assert.match(sent[0].html, /Crear nueva contraseña/);
  assert.match(sent[0].text, /vence en 30 minutos/);
  assert.match(sent[0].html, /https:\/\/psicoeducandonos\.org\/restablecer-password\.html\?token=/);
  assert.ok(!sent[0].idempotencyKey.includes(token));
});

test('restringe el enlace exclusivamente a APP_PUBLIC_URL', () => {
  const service = new EmailService({
    provider: { send: async () => {} }, from: 'cuentas@example.org', appPublicUrl: 'https://psicoeducandonos.org'
  });
  const url = new URL(service.createPasswordResetUrl(token));
  assert.equal(url.origin, 'https://psicoeducandonos.org');
  assert.equal(url.pathname, '/restablecer-password.html');
  assert.throws(() => new EmailService({
    provider: { send: async () => {} }, from: 'cuentas@example.org', appPublicUrl: 'https://psicoeducandonos.org/ruta'
  }), /origen público/);
});

test('rechaza inyección HTML en valores dinámicos', async () => {
  let sent;
  const service = new EmailService({
    provider: { send: async message => { sent = message; } },
    from: 'cuentas@example.org',
    appPublicUrl: 'https://psicoeducandonos.org'
  });
  await assert.rejects(
    service.sendPasswordReset({ to: 'persona@example.net', token, expiresInMinutes: '<img src=x onerror=alert(1)>' }),
    /expiración/
  );
  assert.equal(sent, undefined);
});

test('clasifica errores temporales y permanentes de Resend', async () => {
  const temporary = new ResendEmailProvider({
    client: { emails: { send: async () => ({ error: { statusCode: 429, name: 'rate_limit_exceeded' } }) } }
  });
  await assert.rejects(temporary.send({ from: 'a@example.org', to: 'b@example.org', subject: 'x', text: 'x', html: '<p>x</p>' }),
    error => error instanceof EmailDeliveryError && error.temporary === true);
  const permanent = new ResendEmailProvider({
    client: { emails: { send: async () => ({ error: { statusCode: 422, name: 'validation_error' } }) } }
  });
  await assert.rejects(permanent.send({ from: 'a@example.org', to: 'b@example.org', subject: 'x', text: 'x', html: '<p>x</p>' }),
    error => error instanceof EmailDeliveryError && error.temporary === false);
});

test('aplica timeout al proveedor', async () => {
  const provider = new ResendEmailProvider({
    timeoutMs: 10, client: { emails: { send: async () => new Promise(() => {}) } }
  });
  await assert.rejects(provider.send({ from: 'a@example.org', to: 'b@example.org', subject: 'x', text: 'x', html: '<p>x</p>' }),
    error => error.code === 'email_timeout' && error.temporary === true);
});
