# ADR-007: proveedores y alcance de pagos

- Estado: aceptado
- Fecha de decisión: 2026-08-13
- Alcance inicial: Argentina y pagos internacionales en USD

## Contexto

Psicoeducándonos vende cursos y consultas. Commerce debe cobrar en Argentina y
aceptar pagos internacionales sin acoplar matrícula o agenda a una pasarela. La
confirmación de una redirección del navegador no constituye prueba de pago; se
mantiene ADR-005 como autoridad sobre la entrega.

## Decisión

Se adopta una estrategia multiproveedor progresiva detrás del contrato interno
`PaymentProvider`:

1. **Mercado Pago Checkout Pro** será el proveedor primario para Argentina, con
   precios y cobros en `ARS`.
2. **PayPal Checkout / Orders** será el proveedor secundario para compradores
   internacionales, con precios y cobros en `USD`.
3. **Cripto** queda como extensión futura del contrato, deshabilitada y sin
   activos, cotizaciones ni direcciones almacenadas en esta etapa.

La selección se realiza sobre una oferta explícita elegida por el comprador:

| Oferta | Proveedor | Moneda |
|---|---|---|
| Argentina / ARS | Mercado Pago | ARS |
| Internacional / USD | PayPal | USD |

No se convertirá moneda en el navegador ni durante el checkout. Cada producto
debe tener precios administrativos independientes en ARS y USD. El servidor
resuelve el `product_price`, crea el snapshot de orden y selecciona el proveedor
compatible. Si una oferta o proveedor está deshabilitado, no se crea la orden y
se informa indisponibilidad; no existe fallback silencioso entre monedas.

## Contrato común

Cada adaptador implementará como mínimo:

- `createCheckout(order)`;
- `verifyWebhook(request)`;
- `fetchPayment(providerPaymentId)`;
- `normalizePayment(providerPayment)`;
- `refund(payment, amount)` cuando la política de negocio sea aprobada;
- claves idempotentes y referencias internas de orden.

Los estados externos se traducen a los estados canónicos de Commerce. Los
payloads completos del proveedor no se exponen al navegador ni se copian a
auditoría; se conserva identificador externo, hash, estado normalizado e
información mínima de conciliación.

## Seguridad y entrega

- Mercado Pago valida `x-signature`, `x-request-id` y `data.id`; después consulta
  el pago a la API de Mercado Pago y contrasta referencia, importe, moneda y
  cuenta receptora.
- PayPal verifica las cabeceras de transmisión con el Webhook ID mediante el
  mecanismo oficial; después consulta/captura la orden necesaria y contrasta
  referencia, importe, moneda y beneficiario.
- Solo un webhook válido y conciliado puede marcar el pago como aprobado.
- Las URLs de éxito, pendiente y error solo consultan el estado interno.
- Identificadores de eventos y pagos son únicos por proveedor.
- Reintentos, eventos duplicados y eventos fuera de orden son idempotentes.
- Credenciales de sandbox y producción son distintas, rotables y nunca se
  almacenan en el repositorio.
- El sistema no recibe ni almacena números de tarjeta.

## Cripto futuro

El núcleo conserva la posibilidad de registrar otro `PaymentProvider`, pero no
se agregan todavía estados específicos de blockchain al dominio común. Antes de
habilitarlo deben decidirse proveedor custodial/no custodial, activos aceptados,
redes, expiración de cotización, confirmaciones, reembolsos, contabilidad,
prevención de lavado y tratamiento de volatilidad. El precio comercial seguirá
teniendo una moneda fiat de referencia y la cotización será temporal.

## Despliegue progresivo

1. Implementar Mercado Pago en sandbox: aprobado, pendiente, rechazo, evento
   duplicado, importe alterado, expiración y reembolso.
2. Piloto productivo limitado en ARS y conciliación diaria.
3. Implementar PayPal en sandbox con la misma matriz contractual.
4. Piloto productivo internacional en USD.
5. Activar pagos de consultas únicamente después de validar holds expirados y
   confirmación de cita por webhook.
6. Evaluar cripto en un ADR separado cuando exista demanda y revisión legal.

## Criterios de salida a producción

- Cuenta comercial receptora argentina y situación fiscal confirmadas.
- Políticas publicadas de cancelación, reembolso, contracargo y consultas.
- URLs HTTPS separadas para sandbox y producción.
- Secretos configurados en el entorno y rotación ensayada.
- Matriz E2E aprobada para ambos proveedores.
- Conciliación y alertas de `pago aprobado sin entrega` y `entrega sin pago`.
- Responsable operativo definido para disputas y reembolsos.
- Revisión legal específica antes de cobrar consultas de salud mental entre
  jurisdicciones.

## Consecuencias

Se obtienen medios locales en Argentina y cobertura internacional en USD sin
duplicar el dominio de órdenes. A cambio, deben operarse dos conciliaciones,
dos juegos de credenciales, dos matrices de webhook y precios administrativos
por moneda. Cripto no incrementa la complejidad del MVP.

## Referencias oficiales verificadas

- Mercado Pago, Webhooks: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
- Mercado Pago, preferencias de Checkout Pro: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/checkout-customization/preferences
- PayPal, Webhooks API: https://developer.paypal.com/docs/api/webhooks/v1/
- PayPal, integración de webhooks: https://developer.paypal.com/api/rest/webhooks/rest/
