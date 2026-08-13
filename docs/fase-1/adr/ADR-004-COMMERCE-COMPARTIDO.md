# ADR-004: Commerce compartido

- Estado: aceptado

## Contexto

Cursos y consultas son vendibles, pero matrícula y cita tienen reglas distintas.

## Decisión

Compartir productos, precios, órdenes, pagos y reembolsos. Academic y Scheduling
reaccionan al pago mediante servicios idempotentes, sin convertirse uno en otro.

## Consecuencias y validación

Se evita duplicar integración financiera. Commerce no conoce lecciones ni
disponibilidad; pruebas contractuales validan ambos consumidores.

