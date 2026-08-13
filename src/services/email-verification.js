const { getEmailService } = require('./email');

async function deliverEmailVerification(email, token, expiresInHours = 24, emailService = getEmailService()) {
  return emailService.sendEmailVerification({ to: email, token, expiresInHours });
}

module.exports = deliverEmailVerification;
