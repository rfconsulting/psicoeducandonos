const crypto = require('node:crypto');

function signature(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

function verifySignature(secret, timestamp, rawBody, received, now = Date.now()) {
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > 300) return false;
  const expected = signature(secret, timestamp, rawBody);
  return typeof received === 'string' && received.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function fakeProvider({ appPublicUrl }) {
  return {
    name: 'fake',
    createCheckout({ orderReference }) {
      return { providerPaymentId: crypto.randomUUID(), checkoutUrl: `${appPublicUrl}/pago-simulado.html?order=${encodeURIComponent(orderReference)}` };
    }
  };
}

function parseMercadoPagoSignature(value = '') {
  return Object.fromEntries(String(value).split(',').map(part => part.trim().split('=', 2)).filter(parts => parts.length === 2));
}

function verifyMercadoPagoSignature(secret, { dataId, requestId, xSignature }, now = Date.now()) {
  const { ts, v1 } = parseMercadoPagoSignature(xSignature);
  if (!ts || !v1 || Math.abs(Math.floor(now / 1000) - Number(ts)) > 300) return false;
  const normalizedId = String(dataId || '').toLowerCase();
  const expected = crypto.createHmac('sha256', secret).update(`id:${normalizedId};request-id:${requestId};ts:${ts};`).digest('hex');
  return v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

function mercadoPagoProvider({ accessToken, appPublicUrl, fetchImpl = fetch }) {
  async function api(path, options = {}) {
    const response = await fetchImpl(`https://api.mercadopago.com${path}`, { ...options, headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Mercado Pago respondió ${response.status}.`);
    return response.json();
  }
  return {
    name: 'mercadopago',
    async createCheckout({ orderReference, description, amountMinor }) {
      const preference = await api('/checkout/preferences', { method: 'POST', headers: { 'x-idempotency-key': orderReference }, body: JSON.stringify({
        external_reference: orderReference,
        items: [{ id: orderReference, title: description, currency_id: 'ARS', quantity: 1, unit_price: amountMinor / 100 }],
        notification_url: `${appPublicUrl}/api/commerce/webhooks/mercadopago`,
        back_urls: { success: `${appPublicUrl}/pago-simulado.html?order=${orderReference}`, pending: `${appPublicUrl}/pago-simulado.html?order=${orderReference}`, failure: `${appPublicUrl}/pago-simulado.html?order=${orderReference}` }
      }) });
      return { providerCheckoutId: preference.id, providerPaymentId: null, checkoutUrl: preference.sandbox_init_point || preference.init_point };
    },
    fetchPayment(paymentId) { return api(`/v1/payments/${encodeURIComponent(paymentId)}`); }
  };
}

module.exports = { signature, verifySignature, fakeProvider, mercadoPagoProvider, parseMercadoPagoSignature, verifyMercadoPagoSignature };
