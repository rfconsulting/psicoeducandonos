const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, cleanName, validEmail, validPassword } = require('../src/validation/auth');

test('normaliza correos y nombres', () => {
  assert.equal(normalizeEmail('  Persona@Ejemplo.COM '), 'persona@ejemplo.com');
  assert.equal(cleanName('  Ana   María  '), 'Ana María');
});

test('rechaza correos inválidos', () => {
  assert.equal(validEmail('persona@example.com'), true);
  assert.equal(validEmail('sin-arroba'), false);
  assert.equal(validEmail(`${'a'.repeat(250)}@x.com`), false);
});

test('aplica la política de contraseñas', () => {
  assert.equal(validPassword('Segura-2026!Ab'), true);
  assert.equal(validPassword('corta1!A'), false);
  assert.equal(validPassword('sin-mayuscula-2026!'), false);
  assert.equal(validPassword('SIN-MINUSCULA-2026!'), false);
  assert.equal(validPassword('SinSimbolo2026Ab'), false);
});
