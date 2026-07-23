const crypto = require('node:crypto');
const env = require('../config/env');

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const encryptionKey = env.mfaEncryptionKey
  ? Buffer.from(env.mfaEncryptionKey, 'hex')
  : crypto.createHash('sha256').update(env.sessionSecret).digest();

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(value) {
  const bits = value.replace(/=+$/g, '').toUpperCase().split('').map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function encrypt(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

function decrypt(payload) {
  const [iv, tag, encrypted] = payload.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function codeFor(secret, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function verify(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some(offset => {
    const expected = codeFor(secret, counter + offset);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)));
  });
}

module.exports = { generateSecret, encrypt, decrypt, verify, codeFor };
