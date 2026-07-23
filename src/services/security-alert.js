const env = require('../config/env');
const logger = require('./logger');

async function securityAlert(type, fields = {}) {
  if (!env.securityAlertWebhookUrl) return false;
  try {
    const response = await fetch(env.securityAlertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.securityAlertWebhookSecret}` },
      body: JSON.stringify({ type, timestamp: new Date().toISOString(), ...fields }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    logger.error('security_alert_delivery_failed', { type, errorName: error.name });
    return false;
  }
}

module.exports = securityAlert;
