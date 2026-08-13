# Matriz de autorización objetivo

La decisión combina cuenta, verificación, rol/capacidad, propiedad del recurso y
estado de negocio. Ocultar controles en la interfaz no concede seguridad.

| Acción | Visitante | Student | Professional | Teacher | Admin | Superuser |
|---|---:|---:|---:|---:|---:|---:|
| Registrar cuenta | Sí | N/A | N/A | N/A | N/A | N/A |
| Verificar correo propio | Sí, con token | Sí | Sí | Sí | Sí | Sí |
| Editar perfil propio en estado editable | No | Sí | Según alcance | No | Asistencia auditada | Sí |
| Enviar perfil propio | No | Sí | No | No | No | Sí |
| Revisar perfil estudiantil | No | No | No | No | Sí | Sí |
| Ver catálogo publicado | Según política | Sí | Sí | Sí | Sí | Sí |
| Autoinscribirse gratis | No | Según elegibilidad | No | No | No | Sí |
| Comprar curso | No | Según elegibilidad | No | No | No | Sí |
| Acceder al aula | No | Matrícula activa | No | Curso propio | Sí | Sí |
| Solicitar consulta | No | Cuenta verificada | Cuenta verificada | Cuenta verificada | Sí | Sí |
| Gestionar disponibilidad propia | No | No | Sí | Solo si además profesional | No | Sí |
| Gestionar agenda global | No | No | No | No | Sí | Sí |
| Procesar webhook | Proveedor autenticado, sin sesión de usuario |
| Consultar auditoría sensible | No | No | No | No | No | Sí |

## Políticas por recurso

- `requireAuth`: cuenta activa y sesión vigente.
- `requireVerifiedEmail`: correo verificado.
- `requireCapability`: acción permitida por rol.
- `requireResourceScope`: propiedad o alcance global.
- `requireApprovedStudent`: solo para políticas académicas que lo exijan.
- `requireActiveEnrollment`: acceso al contenido de un curso.
- `requireProfessionalScope`: profesional dueño del servicio/cita.
- `requireVerifiedWebhook`: firma, timestamp, proveedor e idempotencia.

Las consultas no dependen por defecto de `requireApprovedStudent`. Los cursos
declaran `enrollment_policy: open | approved_students | admin_only`.

## Respuestas negativas

- `401`: falta autenticación válida.
- `403`: identidad conocida sin autorización o precondición.
- `404`: recurso inexistente o fuera de alcance cuando revelar existencia genera
  una fuga de información.
- `409`: transición o concurrencia incompatible.
- `422`: entrada sintácticamente válida que incumple reglas.

