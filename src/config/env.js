const crypto = require('node:crypto');
require('dotenv').config();

const required = ['SESSION_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
if (process.env.SESSION_SECRET.length < 64) throw new Error('SESSION_SECRET debe tener al menos 64 caracteres.');
if (!['development', 'test', 'production'].includes(process.env.NODE_ENV || 'development')) throw new Error('NODE_ENV debe ser development, test o production.');

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  return value;
}

function optionalUrl(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) return '';
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`${name} debe utilizar HTTPS en producción.`);
  return url.toString().replace(/\/$/, '');
}

function publicApplicationUrl() {
  const value = optionalUrl('APP_PUBLIC_URL') || 'http://localhost:3000';
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('APP_PUBLIC_URL debe contener únicamente el origen público, sin credenciales, ruta, query ni fragmento.');
  }
  return url.origin;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: integer('PORT', 3000, 1, 65535),
  trustProxy: integer('TRUST_PROXY', 0, 0, 10),
  sessionSecret: process.env.SESSION_SECRET,
  db: {
    host: process.env.DB_HOST,
    port: integer('DB_PORT', 3306, 1, 65535),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: integer('DB_CONNECTION_LIMIT', 10, 1, 100),
    charset: 'utf8mb4'
  },
  appPublicUrl: publicApplicationUrl(),
  emailProvider: String(process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase(),
  resendApiKey: String(process.env.RESEND_API_KEY || '').trim(),
  emailFrom: String(process.env.EMAIL_FROM || '').trim(),
  securityAlertEmail: String(process.env.SECURITY_ALERT_EMAIL || '').trim(),
  mfaEncryptionKey: String(process.env.MFA_ENCRYPTION_KEY || ''),
  dataRetentionDays: integer('DATA_RETENTION_DAYS', 730, 30, 3650)
};

if (env.emailProvider !== 'resend') throw new Error('EMAIL_PROVIDER debe ser resend.');
if (env.isProduction && !env.resendApiKey) throw new Error('RESEND_API_KEY es obligatorio en producción.');
if (env.isProduction && !env.emailFrom) throw new Error('EMAIL_FROM es obligatorio en producción.');
if (env.isProduction && !process.env.APP_PUBLIC_URL) throw new Error('APP_PUBLIC_URL es obligatorio en producción.');
if (env.mfaEncryptionKey && !/^[a-f0-9]{64}$/i.test(env.mfaEncryptionKey)) throw new Error('MFA_ENCRYPTION_KEY debe contener exactamente 64 caracteres hexadecimales.');
if (env.isProduction && !env.mfaEncryptionKey) throw new Error('MFA_ENCRYPTION_KEY es obligatorio en producción.');

env.randomToken = () => crypto.randomBytes(32).toString('hex');
module.exports = Object.freeze(env);
