# ADR-007: proveedor y alcance de pagos

- Estado: pendiente

## Contexto

La elección depende de países, monedas, impuestos, medios requeridos,
contracargos, reembolsos, costos y soporte operativo.

## Alternativas

- Mercado Pago: fuerte cobertura regional y moneda local.
- PayPal: cobertura internacional, con experiencia y costos distintos.
- Integración progresiva: un proveedor inicial detrás de `PaymentProvider` y
  otro solo cuando exista demanda verificada.

## Decisión requerida

Negocio/finanzas debe definir país de la entidad cobradora, países de clientes,
monedas, primer proveedor y política de reembolso. Hasta entonces se permite
construir contratos internos y adaptador falso, pero no checkout productivo.

## Validación

Prueba sandbox de pago, rechazo, duplicado, expiración, reembolso y conciliación;
revisión legal/contable documentada.

