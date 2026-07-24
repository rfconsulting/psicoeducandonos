const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('dotenv').config({ quiet: true });

const projectRoot = path.resolve(__dirname, '..');
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'psicoeducandonos-hostinger-'));
const include = ['package.json', 'package-lock.json', 'public', 'src', 'scripts', 'database'];

for (const entry of include) {
  fs.cpSync(path.join(projectRoot, entry), path.join(stagingRoot, entry), {
    recursive: true,
    filter: source => !/node_modules|\.log$|\.zip$/i.test(source)
  });
}

const overrides = {
  NODE_ENV: 'production',
  PORT: process.env.PORT || '3000',
  TRUST_PROXY: '1',
  DB_HOST: 'localhost',
  DB_PORT: process.env.DB_PORT || '3306',
  DB_NAME: 'u913552146_psiconode',
  DB_USER: 'u913552146_psiconode',
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_CONNECTION_LIMIT: process.env.DB_CONNECTION_LIMIT || '10',
  SESSION_SECRET: process.env.SESSION_SECRET,
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  APP_PUBLIC_URL: 'https://psicoeducandonos.org',
  SECURITY_ALERT_EMAIL: process.env.SECURITY_ALERT_EMAIL || '',
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
  DATA_RETENTION_DAYS: process.env.DATA_RETENTION_DAYS || '730',
  SUPERUSER_NAME: process.env.SUPERUSER_NAME,
  SUPERUSER_EMAIL: process.env.SUPERUSER_EMAIL,
  SUPERUSER_PASSWORD: process.env.SUPERUSER_PASSWORD
};

const missing = Object.entries(overrides)
  .filter(([key, value]) => !value && !['SECURITY_ALERT_EMAIL'].includes(key))
  .map(([key]) => key);
if (missing.length) throw new Error(`Faltan variables para el artefacto: ${missing.join(', ')}`);

const envFile = Object.entries(overrides)
  .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
  .join('\n');
fs.writeFileSync(path.join(stagingRoot, '.env'), `${envFile}\n`, { mode: 0o600 });
console.log(stagingRoot);
