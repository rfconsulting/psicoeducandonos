# Fase 9 — Mercado Pago Argentina

- Checkout Pro para ofertas ARS mediante preferencias creadas en backend.
- Referencia interna e idempotencia por orden.
- Webhook con manifiesto oficial `data.id`, `x-request-id`, `ts` y HMAC SHA-256.
- Consulta autoritativa de `/v1/payments/{id}`.
- Conciliación de ARS, importe, orden y `collector_id` antes de entregar.
- Matrículas y citas reutilizan el fulfillment transaccional existente.
- Credenciales obligatorias solo cuando `PAYMENT_PROVIDER=mercadopago`.
- `provider_checkout_id` separado del identificador del pago real.

PayPal USD permanece como siguiente adaptador; una oferta USD no puede enviarse accidentalmente a Mercado Pago.
