const crypto = require('node:crypto');

const PASSWORD_RESET_EXPIRES_MINUTES = 30;
const STUDENT_SETUP_EXPIRES_MINUTES = 24 * 60;
const GENERIC_FORGOT_RESPONSE = 'Si la cuenta existe, recibirás instrucciones para restablecer la contraseña.';

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function genericForgotPasswordResponse() {
  return { message: GENERIC_FORGOT_RESPONSE };
}

function isResetTokenUsable({ expiresAt, usedAt }, now = new Date()) {
  return !usedAt && new Date(expiresAt).getTime() > now.getTime();
}

module.exports = {
  PASSWORD_RESET_EXPIRES_MINUTES,
  STUDENT_SETUP_EXPIRES_MINUTES,
  generateResetToken,
  hashResetToken,
  genericForgotPasswordResponse,
  isResetTokenUsable
};
