const env = require('../config/env');

async function deliverPasswordReset(email, token) {
  if (!env.passwordResetWebhookUrl) return false;
  const response = await fetch(env.passwordResetWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.passwordResetWebhookSecret ? { authorization: `Bearer ${env.passwordResetWebhookSecret}` } : {})
    },
    body: JSON.stringify({
      email,
      resetUrl: `${env.publicBaseUrl}/restablecer-password.html?token=${encodeURIComponent(token)}`
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`El proveedor de correo respondió ${response.status}.`);
  return true;
}

module.exports = deliverPasswordReset;
