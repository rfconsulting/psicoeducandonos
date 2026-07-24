const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '..', '.env');
const source = fs.readFileSync(envPath, 'utf8');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
let password;
do {
  password = Array.from(crypto.randomBytes(32), byte => alphabet[byte % alphabet.length]).join('');
} while (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password));
const line = `DB_PASSWORD=${JSON.stringify(password)}`;
const updated = /^DB_PASSWORD=.*$/m.test(source)
  ? source.replace(/^DB_PASSWORD=.*$/m, line)
  : `${source.trimEnd()}\n${line}\n`;
fs.writeFileSync(envPath, updated, { mode: 0o600 });
console.log('Contraseña MySQL local rotada sin mostrar su valor.');
