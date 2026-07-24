const { getEmailService } = require('./email');

async function deliverPasswordReset(email, token, expiresInMinutes = 30, emailService = getEmailService()) {
  return emailService.sendPasswordReset({ to: email, token, expiresInMinutes });
}

module.exports = deliverPasswordReset;
