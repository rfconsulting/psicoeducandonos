const crypto = require('node:crypto');

const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;
const GENERIC_REGISTRATION_RESPONSE = 'Si el correo puede registrarse, recibirás un enlace para verificar tu cuenta.';
const GENERIC_RESEND_RESPONSE = 'Si existe una cuenta pendiente, recibirás un nuevo enlace de verificación.';

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isVerificationToken(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function genericRegistrationResponse() {
  return { message: GENERIC_REGISTRATION_RESPONSE };
}

function genericResendResponse() {
  return { message: GENERIC_RESEND_RESPONSE };
}

module.exports = {
  EMAIL_VERIFICATION_EXPIRES_HOURS,
  generateVerificationToken,
  hashVerificationToken,
  isVerificationToken,
  genericRegistrationResponse,
  genericResendResponse
};
