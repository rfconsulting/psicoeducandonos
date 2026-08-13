# Fase 3: perfil estudiantil progresivo

## Resultado

El estudiante autenticado dispone de **Mi perfil**, puede guardar campos
parcialmente, consultar su porcentaje calculado y enviarlo explícitamente para
validación. La aprobación administrativa corresponde a la Fase 4.

## Estados disponibles

```text
draft -> submitted
changes_requested -> submitted
```

`submitted`, `under_review`, `approved` y `rejected` son de solo lectura para el
estudiante. La Fase 4 implementará sus transiciones administrativas.

## Modelo P9

- `student_profiles`: datos personales/profesionales y estado de revisión.
- `student_profile_consents`: aceptación versionada e histórica.
- `student_profile_documents`: metadatos privados preparados para una futura
  carga segura. P9 no implementa upload ni almacenamiento de archivos.

El porcentaje no se persiste: se deriva de los campos obligatorios. Para camino
`health-professional`, la matrícula/licencia también es obligatoria.

## API

- `GET /api/student-profile/me`
- `PATCH /api/student-profile/me`
- `POST /api/student-profile/me/submit`

Las tres rutas requieren rol `student`; las mutaciones requieren CSRF. El ID se
toma de la sesión revalidada y nunca del cuerpo o URL.

## Privacidad y auditoría

- La auditoría de guardado contiene nombres de campos, no sus valores.
- El envío registra las versiones de consentimiento, no documentos ni datos.
- Documentos, historia clínica y notas terapéuticas permanecen fuera de alcance.
- Un perfil enviado se bloquea para impedir cambios silenciosos durante revisión.

## Migración y rollback

P9 es aditiva y reejecutable. Antes de producción se crea respaldo y se ejecuta
`npm run migrate:p9`. Si falla, no se inicia la nueva versión y se restaura el
respaldo. Las tablas nuevas no alteran `applications`, usuarios ni matrículas.

## Verificación manual

1. Entrar con estudiante verificado.
2. Guardar dos campos, salir y confirmar persistencia.
3. Confirmar porcentaje parcial.
4. Verificar rechazo de fecha menor de 18 años y enum inválido.
5. Completar campos y aceptar ambos consentimientos.
6. Enviar y comprobar estado `submitted` y formulario bloqueado.
7. Confirmar que otro estudiante no puede consultar ni editar el perfil.
