# ADR-006: reserva transaccional con hold

- Estado: aceptado

## Contexto

Dos clientes pueden elegir la misma franja antes de que uno complete el pago.

## Decisión

Crear un hold temporal dentro de una transacción, con bloqueo y restricción de
integridad para franjas incompatibles. Confirmar la cita solo después del pago.

## Consecuencias y validación

Se necesita expiración idempotente y manejo de pagos tardíos. Una prueba
concurrente debe demostrar que solo una reserva resulta aceptada.

