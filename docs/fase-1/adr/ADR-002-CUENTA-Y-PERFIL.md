# ADR-002: separar cuenta y perfil estudiantil

- Estado: aceptado

## Contexto

`users.status` expresa seguridad de la cuenta y no puede representar revisión,
matrícula o derecho a una consulta.

## Decisión

`users` conserva identidad y seguridad. `student_profiles` gobierna datos y
estado de revisión. Las políticas combinan ambos sin copiar estados.

## Consecuencias y validación

Una cuenta verificada puede iniciar sesión con perfil pendiente. Las pruebas
deben cubrir cuenta suspendida, perfil pendiente y perfil aprobado por separado.

