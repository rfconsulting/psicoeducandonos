# Fase 6 — Commerce Core

## Alcance implementado

- Productos vinculados mediante clave foránea a cursos y precios activos en unidades menores enteras.
- Órdenes e ítems con snapshot de descripción, moneda e importe.
- Pagos y eventos externos separados, con identificadores únicos por proveedor.
- Checkout desacoplado mediante `PaymentProvider`.
- Adaptador `fake` exclusivo para desarrollo y pruebas; producción lo rechaza explícitamente.
- Webhook firmado HMAC, ventana máxima de cinco minutos, hash del payload e idempotencia atómica.
- Validación de moneda e importe antes de aprobar.
- Pago confirmado por webhook crea o reactiva la matrícula con fuente `paid` y `order_id`.
- La URL de retorno solo consulta estado y nunca concede acceso.

## Configuración segura

El valor predeterminado es `PAYMENT_PROVIDER=disabled`. Para pruebas locales puede usarse `fake` con un secreto aleatorio de al menos 32 caracteres. La selección de Mercado Pago, PayPal u otro proveedor productivo continúa pendiente de la decisión registrada en ADR-007.

## Gate de salida

```bash
npm test
npm run lint
npm audit --audit-level=high
npm run check:secrets
npm run db:verify
```

P12 se ejecuta dos veces mediante `db:verify` para comprobar su repetibilidad.
