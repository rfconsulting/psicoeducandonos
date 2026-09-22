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

function paypalProvider({ environment, clientId, clientSecret, webhookId, appPublicUrl, fetchImpl = fetch }) {
  const baseUrl = environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  let tokenCache = null;

  async function accessToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 30000) return tokenCache.value;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`PayPal respondió ${response.status} al autenticar.`);
    const token = await response.json();
    tokenCache = { value: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 300) * 1000 };
    return tokenCache.value;
  }

  async function api(path, options = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`PayPal respondió ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }

  return {
    name: 'paypal',
    async createCheckout({ orderReference, description, amountMinor }) {
      const order = await api('/v2/checkout/orders', {
        method: 'POST',
        headers: { 'paypal-request-id': `create-${orderReference}` },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: orderReference,
            custom_id: orderReference,
            invoice_id: orderReference,
            description,
            amount: { currency_code: 'USD', value: (amountMinor / 100).toFixed(2) }
          }],
          payment_source: { paypal: { experience_context: {
            user_action: 'PAY_NOW',
            return_url: `${appPublicUrl}/pago-simulado.html?order=${encodeURIComponent(orderReference)}`,
            cancel_url: `${appPublicUrl}/pago-simulado.html?order=${encodeURIComponent(orderReference)}`
          } } }
        })
      });
      const approve = order.links?.find(link => ['payer-action', 'approve'].includes(link.rel));
      if (!order.id || !approve?.href) throw new Error('PayPal no devolvió una URL de aprobación.');
      return { providerCheckoutId: order.id, providerPaymentId: null, checkoutUrl: approve.href };
    },
    captureOrder(orderId, requestId) {
      return api(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST', headers: { 'paypal-request-id': requestId }, body: '{}'
      });
    },
    fetchCapture(captureId) { return api(`/v2/payments/captures/${encodeURIComponent(captureId)}`); },
    refundCapture(captureId, { requestId, amountMinor = null } = {}) {
      const body = amountMinor === null ? {} : { amount: { currency_code: 'USD', value: (amountMinor / 100).toFixed(2) } };
      return api(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: 'POST', headers: { 'paypal-request-id': requestId }, body: JSON.stringify(body)
      });
    },
    async verifyWebhook(headers, webhookEvent) {
      const result = await api('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: webhookEvent
        })
      });
      return result?.verification_status === 'SUCCESS';
    }
  };
}

module.exports = { signature, verifySignature, fakeProvider, mercadoPagoProvider, paypalProvider, parseMercadoPagoSignature, verifyMercadoPagoSignature };
