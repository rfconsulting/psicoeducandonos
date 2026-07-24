const env = require('../config/env');
const logger = require('./logger');
const { getEmailService } = require('./email');

async function securityAlert(type, fields = {}) {
  if (!env.securityAlertEmail) return false;
  try {
    return await getEmailService().sendSecurityAlert({
      to: env.securityAlertEmail,
      type,
      fields
    });
  } catch (error) {
    logger.error('security_alert_delivery_failed', {
      type: String(type).slice(0, 80),
      errorCode: error.code || 'email_delivery_failed',
      temporary: error.temporary === true
    });
    return false;
  }
}

module.exports = securityAlert;
