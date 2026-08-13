# ADR-003: preservar applications como histórico

- Estado: aceptado

## Contexto

`applications` contiene postulaciones y decisiones existentes, pero no es un
modelo adecuado para el onboarding progresivo.

## Decisión

No aceptar nuevos registros en `applications` tras el corte. Migrar de forma
aditiva a perfiles con referencia de origen y conservar el histórico de solo
lectura durante la retención acordada.

## Consecuencias y validación

Hay convivencia temporal y consultas adaptadoras. Se validan conteos, vínculos,
repetibilidad y ausencia de borrado antes del corte.

