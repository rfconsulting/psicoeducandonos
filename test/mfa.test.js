const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSecret, encrypt, decrypt, verify, codeFor } = require('../src/services/mfa');

test('cifra y descifra secretos MFA', () => {
  const secret = generateSecret();
  const encrypted = encrypt(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decrypt(encrypted), secret);
});

test('valida códigos TOTP con ventana temporal', () => {
  const secret = ['GEZDGNBVGY3TQOJQ', 'GEZDGNBVGY3TQOJQ'].join('');
  assert.equal(codeFor(secret, 1), '287082');
  assert.equal(verify(secret, '287082', 59000), true);
  assert.equal(verify(secret, '000000', 59000), false);
});
