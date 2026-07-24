const { Resend } = require('resend');
const { EmailDeliveryError } = require('./errors');

const TEMPORARY_STATUSES = new Set([408, 409, 425, 429]);

function isTemporary(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  return TEMPORARY_STATUSES.has(status) || status >= 500
    || ['rate_limit_exceeded', 'application_error', 'internal_server_error'].includes(error?.name);
}

class ResendEmailProvider {
  constructor({ apiKey, timeoutMs = 8000, client } = {}) {
    if (!apiKey && !client) throw new TypeError('RESEND_API_KEY no está configurada.');
    this.client = client || new Resend(apiKey);
    this.timeoutMs = timeoutMs;
  }

  async send({ idempotencyKey, ...message }) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new EmailDeliveryError('El proveedor de correo excedió el tiempo de espera.', {
        code: 'email_timeout', temporary: true
      })), this.timeoutMs);
    });
    try {
      const result = await Promise.race([this.client.emails.send(message, { idempotencyKey }), timeout]);
      if (result?.error) {
        throw new EmailDeliveryError('El proveedor rechazó el correo.', {
          code: 'email_provider_rejected', temporary: isTemporary(result.error)
        });
      }
      if (!result?.data?.id) throw new EmailDeliveryError('El proveedor devolvió una respuesta inválida.', { code: 'email_invalid_response' });
      return { id: result.data.id };
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError('No fue posible contactar al proveedor de correo.', {
        code: 'email_provider_unavailable', temporary: isTemporary(error), cause: error
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = ResendEmailProvider;
