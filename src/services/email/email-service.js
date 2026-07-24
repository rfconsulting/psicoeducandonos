const crypto = require('node:crypto');
const { passwordResetTemplate, securityAlertTemplate } = require('./templates');

class EmailService {
  constructor({ provider, from, appPublicUrl }) {
    if (!provider || typeof provider.send !== 'function') throw new TypeError('Se requiere un proveedor de correo.');
    this.provider = provider;
    this.from = from;
    this.appPublicUrl = new URL(appPublicUrl);
    if (this.appPublicUrl.pathname !== '/' || this.appPublicUrl.search || this.appPublicUrl.hash) {
      throw new TypeError('APP_PUBLIC_URL debe contener únicamente el origen público.');
    }
  }

  createPasswordResetUrl(token) {
    if (!/^[a-f0-9]{64}$/i.test(String(token))) throw new TypeError('Token de recuperación inválido.');
    const url = new URL('/restablecer-password.html', this.appPublicUrl);
    url.searchParams.set('token', token);
    if (url.origin !== this.appPublicUrl.origin) throw new Error('El enlace de recuperación no pertenece a APP_PUBLIC_URL.');
    return url.toString();
  }

  async sendPasswordReset({ to, token, expiresInMinutes = 30 }) {
    if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 1440) {
      throw new TypeError('La expiración del enlace es inválida.');
    }
    const resetUrl = this.createPasswordResetUrl(token);
    const message = passwordResetTemplate({ resetUrl, expiresInMinutes });
    const idempotencyKey = `password-reset/${crypto.createHash('sha256').update(token).digest('hex')}`;
    await this.provider.send({ from: this.from, to, ...message, idempotencyKey });
    return true;
  }

  async sendSecurityAlert({ to, type, fields = {} }) {
    if (!to) return false;
    const occurredAt = new Date().toISOString();
    const message = securityAlertTemplate({ type: String(type).slice(0, 80), fields, occurredAt });
    const idempotencyKey = `security-alert/${crypto.randomUUID()}`;
    await this.provider.send({ from: this.from, to, ...message, idempotencyKey });
    return true;
  }
}

module.exports = EmailService;
