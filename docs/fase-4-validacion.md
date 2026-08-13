# Fase 4: validación administrativa de estudiantes

## Resultado

Administradores y superusuario disponen de una cola **Validación de estudiantes**
con búsqueda, filtros, detalle del perfil y decisiones controladas. El estudiante
ve su estado e historial de observaciones desde **Mi perfil**.

## Transiciones

```text
submitted -> under_review
under_review -> changes_requested | approved | rejected
changes_requested -> submitted        (acción del estudiante, Fase 3)
approved | rejected -> under_review    (reapertura administrativa)
```

Solicitar cambios, rechazar y reabrir exigen una nota de al menos diez caracteres.
No se permiten saltos como `submitted -> approved`.

## Modelo P10

`student_profile_reviews` conserva de manera inmutable:

- perfil;
- revisor;
- estado anterior;
- decisión;
- estado resultante;
- nota;
- fecha.

El estado actual continúa en `student_profiles`. El historial no se sobrescribe.

## API

- `GET /api/student-profile-reviews`
- `GET /api/student-profile-reviews/:id`
- `POST /api/student-profile-reviews/:id/decisions`

Requieren `student-profile:review`, asignada solo a administrador y superusuario.
Cada decisión bloquea el perfil con `FOR UPDATE` y confirma estado, historial y
auditoría en la misma transacción.

## Política de aprobación

`requireApprovedStudent` consulta MySQL y está disponible para operaciones que
declaren aprobación como precondición. No se aplicó globalmente ni a consultas.
Las matrículas existentes tampoco se bloquean retroactivamente.

## Privacidad

- El estudiante ve decisión, estado, nota y fecha, pero no la identidad interna
  del revisor.
- La auditoría contiene transición y decisión, no valores del perfil ni notas.
- Solo roles autorizados reciben documento, motivación y datos profesionales.

## Migración y rollback

P10 es aditiva y reejecutable. Antes de producción se crea respaldo y se ejecuta
`npm run migrate:p10`. Ante fallo no se inicia la nueva versión y se restaura el
respaldo. No se eliminan postulaciones ni decisiones históricas anteriores.

## Verificación manual

1. Enviar un perfil desde una cuenta estudiante.
2. Confirmar aparición en la cola `submitted`.
3. Iniciar revisión y comprobar historial.
4. Solicitar cambios con nota y verificar que el estudiante puede editar otra vez.
5. Reenviar, revisar y aprobar.
6. Confirmar que teacher/writer/student reciben 403 en la API administrativa.
7. Simular dos decisiones concurrentes y confirmar que solo la transición válida
   se confirma.
