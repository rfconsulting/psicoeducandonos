const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function validEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

function validPassword(value) {
  return typeof value === 'string'
    && value.length >= 12
    && value.length <= 72
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

module.exports = { normalizeEmail, cleanName, validEmail, validPassword };
