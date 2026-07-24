const env = require('../../config/env');
const EmailService = require('./email-service');
const ResendEmailProvider = require('./resend-email-provider');

let service;

function getEmailService() {
  if (!service) {
    service = new EmailService({
      provider: new ResendEmailProvider({ apiKey: env.resendApiKey }),
      from: env.emailFrom,
      appPublicUrl: env.appPublicUrl
    });
  }
  return service;
}

module.exports = { getEmailService };
