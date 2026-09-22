const test = require('node:test');
const assert = require('node:assert/strict');
const { paypalProvider } = require('../src/services/payment-provider');
const fs = require('node:fs');
const path = require('node:path');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('PayPal crea una orden USD idempotente con retorno propio', async () => {
  const requests = [];
  const provider = paypalProvider({
    environment: 'sandbox', clientId: 'client', clientSecret: 'secret', webhookId: 'WH-1', appPublicUrl: 'https://example.test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/v1/oauth2/token')) return response({ access_token: 'token', expires_in: 3600 });
      return response({ id: 'ORDER-1', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.test/approve' }] });
    }
  });
  const checkout = await provider.createCheckout({ orderReference: 'internal-1', description: 'Consulta', amountMinor: 1250 });
  const request = requests[1]; const body = JSON.parse(request.options.body);
  assert.equal(request.options.headers['paypal-request-id'], 'create-internal-1');
  assert.equal(body.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(body.purchase_units[0].amount.value, '12.50');
  assert.equal(body.purchase_units[0].custom_id, 'internal-1');
  assert.equal(checkout.providerCheckoutId, 'ORDER-1');
});

test('PayPal verifica webhook mediante el endpoint oficial', async () => {
  const requests = [];
  const provider = paypalProvider({
    environment: 'sandbox', clientId: 'client', clientSecret: 'secret', webhookId: 'WH-1', appPublicUrl: 'https://example.test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/v1/oauth2/token')) return response({ access_token: 'token', expires_in: 3600 });
      return response({ verification_status: 'SUCCESS' });
    }
  });
  const valid = await provider.verifyWebhook({
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/cert',
    'paypal-transmission-id': 'tx-1', 'paypal-transmission-sig': 'signature', 'paypal-transmission-time': '2026-09-19T00:00:00Z'
  }, { id: 'event-1' });
  assert.equal(valid, true);
  assert.equal(JSON.parse(requests[1].options.body).webhook_id, 'WH-1');
});

test('PayPal captura y reembolsa con claves idempotentes', async () => {
  const requests = [];
  const provider = paypalProvider({
    environment: 'sandbox', clientId: 'client', clientSecret: 'secret', webhookId: 'WH-1', appPublicUrl: 'https://example.test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/v1/oauth2/token')) return response({ access_token: 'token', expires_in: 3600 });
      return response({ id: 'ok' });
    }
  });
  await provider.captureOrder('ORDER-1', 'capture-ref');
  await provider.refundCapture('CAPTURE-1', { requestId: 'refund-ref', amountMinor: 500 });
  assert.equal(requests[1].options.headers['paypal-request-id'], 'capture-ref');
  assert.equal(requests[2].options.headers['paypal-request-id'], 'refund-ref');
  assert.equal(JSON.parse(requests[2].options.body).amount.value, '5.00');
});

test('Commerce enruta ARS a Mercado Pago y USD a PayPal sin fallback silencioso', () => {
  const commerce = fs.readFileSync(path.join(__dirname, '../src/routes/commerce.js'), 'utf8');
  assert.match(commerce, /currency === 'ARS'.*mercadopago.*multi/);
  assert.match(commerce, /currency === 'USD'.*paypal.*multi/);
  assert.match(commerce, /return null/);
});

test('la interfaz ofrece cada precio disponible en vez de elegir el primero', () => {
  const student = fs.readFileSync(path.join(__dirname, '../public/estudiante.js'), 'utf8');
  assert.match(student, /item\.prices\.forEach\(price/);
  assert.doesNotMatch(student, /priceId:item\.prices\[0\]\.id/);
});
