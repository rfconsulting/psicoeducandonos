function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function passwordResetTemplate({ resetUrl, expiresInMinutes }) {
  const safeUrl = escapeHtml(resetUrl);
  const safeExpiry = escapeHtml(expiresInMinutes);
  const subject = 'Restablece tu contraseña de Psicoeducándonos';
  const text = [
    'Solicitud para restablecer tu contraseña',
    '',
    `Este enlace de un solo uso vence en ${expiresInMinutes} minutos:`,
    resetUrl,
    '',
    'Si no solicitaste este cambio, ignora este mensaje. Tu contraseña seguirá siendo la misma.',
    'Nunca compartas este enlace.'
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f0e6;font-family:Arial,sans-serif;color:#173c36">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e6;padding:24px 12px">
<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#173c36;color:#fff;padding:28px 32px;font-size:22px;font-weight:bold">Psicoeducándonos</td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:28px">Restablece tu contraseña</h1>
<p style="font-size:16px;line-height:1.6">Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
<p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#173c36;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold">Crear nueva contraseña</a></p>
<p style="font-size:14px;line-height:1.6">El enlace es de un solo uso y vence en <strong>${safeExpiry} minutos</strong>.</p>
<p style="font-size:14px;line-height:1.6">Si no solicitaste este cambio, ignora el mensaje. Tu contraseña seguirá siendo la misma.</p>
<p style="font-size:12px;line-height:1.5;color:#596b67;word-break:break-all">Si el botón no funciona, copia esta dirección:<br>${safeUrl}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function securityAlertTemplate({ type, fields, occurredAt }) {
  const safeType = escapeHtml(type);
  const entries = Object.entries(fields)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `<tr><th align="left" style="padding:6px">${escapeHtml(key)}</th><td style="padding:6px">${escapeHtml(value)}</td></tr>`)
    .join('');
  const textFields = Object.entries(fields)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key}: ${value}`).join('\n');
  return {
    subject: `Alerta de seguridad: ${String(type).slice(0, 80)}`,
    text: `Evento: ${type}\nFecha UTC: ${occurredAt}\n${textFields}`,
    html: `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#173c36">
<h1>Alerta de seguridad</h1><p><strong>Evento:</strong> ${safeType}</p>
<p><strong>Fecha UTC:</strong> ${escapeHtml(occurredAt)}</p><table>${entries}</table>
</body></html>`
  };
}

module.exports = { escapeHtml, passwordResetTemplate, securityAlertTemplate };
