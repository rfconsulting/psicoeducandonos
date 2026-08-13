# ADR-005: webhook verificado como autoridad de pago

- Estado: aceptado

## Contexto

La redirección del checkout pertenece al navegador y puede falsificarse,
repetirse o cerrarse aun cuando el pago haya ocurrido.

## Decisión

Solo un webhook válido e idempotente cambia el pago a aprobado y activa la
entrega. La página de retorno únicamente consulta y muestra estado.

## Consecuencias y validación

La entrega puede ser asíncrona. Se requieren firma, ID único, reintentos,
conciliación y pruebas de duplicados/eventos fuera de orden.

