const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const validProductionEnv = {
  NODE_ENV: 'production',
  SESSION_SECRET: 's'.repeat(64),
  DB_HOST: '127.0.0.1',
  DB_NAME: 'test',
  DB_USER: 'test',
  DB_PASSWORD: 'test-password',
  MFA_ENCRYPTION_KEY: 'a'.repeat(64),
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'configured-for-validation-only',
  EMAIL_FROM: 'Psicoeducándonos <cuentas@psicoeducandonos.org>',
  APP_PUBLIC_URL: 'https://psicoeducandonos.org'
};

for (const variable of ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_PUBLIC_URL']) {
  test(`rechaza producción sin ${variable}`, () => {
    const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ...validProductionEnv, [variable]: '' }
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, new RegExp(variable));
  });
}

test('acepta la configuración completa de correo en producción', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...validProductionEnv }
  });
  assert.equal(result.status, 0, result.stderr);
});
