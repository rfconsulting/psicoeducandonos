# Fase 8 — Pagos de consultas

## Alcance implementado

- Precios de servicios limitados a las ofertas aprobadas por ADR-007: ARS y USD.
- Catálogo de consultas con precios activos.
- Checkout autenticado para el dueño del hold.
- Conversión transaccional `hold -> appointment pending_payment + order + payment`.
- Referencia única del hold para reintentos idempotentes.
- Snapshot de servicio, moneda e importe en la orden.
- El webhook aprobado confirma únicamente citas todavía vigentes.
- Pagos aprobados después del vencimiento no fuerzan una doble reserva: generan `payment_delivery_failed` para conciliación y reembolso.
- Rechazo o cancelación expira la cita pendiente.
- Historial de eventos de la cita y vista “Mis consultas”.

## Frontera productiva

El flujo está validado con el adaptador `fake`. Mercado Pago ARS y PayPal USD se activarán con credenciales sandbox separadas y sus verificadores oficiales. Ninguna credencial ni proveedor simulado puede pasar a producción.

## Gate

```bash
npm test
npm run lint
npm audit --audit-level=high
npm run check:secrets
npm run db:verify
```
