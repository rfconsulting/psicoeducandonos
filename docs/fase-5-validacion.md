# Fase 5 — Catálogo e inscripción

## Alcance implementado

- Cursos con tipo de acceso `free` o `paid` y política `open`, `approved_students` o `admin_only`.
- Compatibilidad segura: los cursos existentes conservan inscripción exclusivamente administrativa.
- Catálogo del estudiante con elegibilidad calculada en servidor.
- Autoinscripción gratuita transaccional, idempotente, protegida por CSRF y con auditoría.
- Matrículas trazables por fuente (`legacy`, `admin`, `free_self`, `paid`).
- Cursos pagos visibles, sin simular checkout antes de implementar Commerce.

## Gate de salida

Ejecutar:

```bash
npm test
npm run lint
npm audit --audit-level=high
npm run check:secrets
npm run db:verify
```

`db:verify` requiere MySQL y valida que P11 sea repetible. La relación de una matrícula con una orden se incorporará junto con las tablas de Commerce, para crear una clave foránea real y no un identificador huérfano.
