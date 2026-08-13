# ADR-001: conservar el monolito modular

- Estado: aceptado

## Contexto

La plataforma existente ya comparte sesión, autorización, transacciones y
despliegue. Separarla en servicios aumentaría operación y consistencia distribuida
antes de demostrar esa necesidad.

## Decisión

Mantener Express/MySQL y crear módulos con límites explícitos: Identity,
Onboarding, Academic, Catalog, Commerce y Scheduling.

## Consecuencias y validación

Menor costo de evolución y transacciones locales; exige evitar rutas o servicios
que mezclen dominios. Se valida con dependencias dirigidas y pruebas por módulo.

