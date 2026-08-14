const test = require('node:test');
const assert = require('node:assert/strict');
const { mercadoPagoProvider, verifyMercadoPagoSignature } = require('../src/services/payment-provider');
const crypto = require('node:crypto');

test('valida el manifiesto oficial de webhook de Mercado Pago', () => {
  const secret = ['mp','webhook','fixture'].join('-').repeat(3); const ts = '1800000000'; const dataId = 'ABC123'; const requestId = 'req-1';
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  assert.equal(verifyMercadoPagoSignature(secret, { dataId, requestId, xSignature: `ts=${ts},v1=${v1}` }, 1800000000000), true);
  assert.equal(verifyMercadoPagoSignature(secret, { dataId: 'otro', requestId, xSignature: `ts=${ts},v1=${v1}` }, 1800000000000), false);
});

test('crea preferencia ARS con referencia, webhook y retorno propios', async () => {
  let request;
  const provider = mercadoPagoProvider({ accessToken: 'token-fixture', appPublicUrl: 'https://example.test', fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ id: 'pref-1', sandbox_init_point: 'https://sandbox.mercadopago.test/checkout' }) }; } });
  const checkout = await provider.createCheckout({ orderReference: 'order-1', description: 'Consulta', amountMinor: 125000 });
  const body = JSON.parse(request.options.body);
  assert.equal(body.external_reference, 'order-1'); assert.equal(body.items[0].currency_id, 'ARS'); assert.equal(body.items[0].unit_price, 1250);
  assert.match(body.notification_url, /webhooks\/mercadopago$/); assert.equal(checkout.providerCheckoutId, 'pref-1');
});
