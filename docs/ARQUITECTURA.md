# Arquitectura de Psicoeducándonos

## 1. Vista general

Psicoeducándonos es una aplicación web monolítica modular:

```text
Navegador
   │ HTTPS + cookie de sesión
   ▼
Express
   ├── Helmet / CSP / límites
   ├── Sesiones MySQL
   ├── CSRF
   ├── Autenticación / MFA
   ├── Capacidades
   ├── Rutas de dominio
   └── Archivos públicos
        │
        ▼
      MySQL/MariaDB

Servicios externos:
   └── Resend (correo transaccional y alertas)
```

El frontend se sirve desde la misma aplicación y usa `fetch` same-origin. No existe CORS abierto ni API pública anónima de contenido.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Runtime | Node.js 20+ |
| Servidor | Express 5 |
| Base de datos | MySQL 8 / MariaDB |
| Sesiones | express-session + express-mysql-session |
| Password hashing | bcryptjs, coste 12 |
| Encabezados | Helmet |
| Rate limiting | express-rate-limit |
| Pruebas | node:test |
| CI | GitHub Actions |

## 3. Estructura del repositorio

```text
.
├── .github/workflows/ci.yml
├── database/
│   └── schema.sql
├── docs/
│   ├── ARQUITECTURA.md
│   └── PROCESO_DE_DESARROLLO.md
├── public/
│   ├── assets/
│   ├── *.html
│   ├── *.css
│   └── *.js
├── scripts/
│   ├── create-superuser.js
│   ├── migrate-p0.js ... migrate-p8.js
│   ├── build-hostinger-archive.js
│   ├── retention.js
│   ├── check-js.js
│   └── check-secrets.js
├── src/
│   ├── config/
│   ├── constants/
│   ├── middleware/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validation/
│   └── server.js
└── test/
```

## 4. Responsabilidades por módulo

### Configuración

`src/config/env.js`

- Carga variables.
- Valida tipos y rangos.
- Exige la configuración de Resend, la URL pública y los secretos en producción.
- Impide iniciar con una configuración incompleta.

`src/config/database.js`

- Crea el pool MySQL.
- Configura conexiones, zona horaria y límites.

### Constantes y autorización

`src/constants/access.js`

- Define roles.
- Define capacidades.
- Mantiene la matriz rol-capacidad.

Ejemplos de capacidades:

```text
article:create
course:create
student:track
user:create
user:role-change
course:enroll
```

### Middleware

`src/middleware/security.js`

- `requireAuth`
- `requireRole`
- `requireCapability`
- `issueCsrfToken`
- `verifyCsrf`

La autenticación revalida MySQL en cada solicitud protegida.

### Rutas

| Archivo | Dominio |
|---|---|
| `auth.js` | login, MFA y contraseñas |
| `users.js` | usuarios, roles, estados, seguimiento |
| `content.js` | artículos y fichas de cursos |
| `learning.js` | módulos, lecciones, inscripción, progreso |
| `applications.js` | postulación pública y revisión de admisiones |
| `audit-log.js` | consulta filtrada del registro de actividad |
| `dashboard.js` | estadísticas globales para administrador y superusuario |

### Repositorios

`content-repository.js` encapsula listados paginados y políticas de borradores.

El patrón debe extenderse a usuarios y aprendizaje cuando crezca la complejidad.

### Servicios

| Servicio | Responsabilidad |
|---|---|
| `audit.js` | eventos de auditoría |
| `transaction.js` | unidad transaccional |
| `logger.js` | logs JSON |
| `mfa.js` | TOTP y cifrado |
| `password-reset.js` | entrega de enlaces |
| `security-alert.js` | alertas externas |

## 5. Flujo HTTP

```text
Solicitud
  → requestId
  → Helmet
  → compresión
  → parser y límites
  → sesión MySQL
  → rate limit
  → autenticación
  → revalidación MySQL
  → MFA / cambio obligatorio
  → capacidad
  → CSRF en mutaciones
  → ruta / repositorio / transacción
  → respuesta
  → log estructurado
```

## 6. Flujo de autenticación

### Login normal

1. Obtener token CSRF.
2. Enviar correo y contraseña.
3. Normalizar correo.
4. Buscar cuenta.
5. Ejecutar bcrypt incluso para cuentas inexistentes mediante hash ficticio.
6. Comprobar estado y bloqueo.
7. Comprobar correo verificado.
8. Regenerar identificador de sesión.
9. Guardar referencia de usuario y `authVersion`.
10. Redirigir según rol.

### Cuenta privilegiada

```text
Contraseña válida
  → contraseña temporal pendiente: cambiarla
  → MFA pendiente: /mfa.html
  → TOTP válido
  → dashboard
```

### Revalidación de sesión

En cada ruta protegida:

- Se carga el usuario.
- Debe estar activo.
- Su rol debe coincidir.
- Su `auth_version` debe coincidir.
- Debe haber completado el cambio temporal.
- Los roles privilegiados deben haber completado MFA.

Si cambia rol, estado o contraseña, la sesión queda obsoleta.

## 7. CSRF

Se utiliza patrón synchronizer token:

- Token aleatorio de 32 bytes en sesión.
- Entrega mediante `/api/csrf-token`.
- Envío por `X-CSRF-Token`.
- Comparación con `timingSafeEqual`.
- Aplicación en POST/PATCH sensibles.

La cookie usa:

```text
HttpOnly
SameSite=Lax
Secure en producción
```

## 8. MFA

### Secreto

- Generado con `crypto.randomBytes(20)`.
- Codificado Base32.
- Cifrado AES-256-GCM.
- Clave de cifrado separada en `MFA_ENCRYPTION_KEY`.

### Código

- TOTP HMAC-SHA1.
- Periodo de 30 segundos.
- Seis dígitos.
- Ventana aceptada: periodo anterior, actual y siguiente.

La clave nunca se registra en logs ni auditoría.

## 9. Recuperación y activación

### Recuperación

- Token: 32 bytes.
- Persistencia: SHA-256.
- Vigencia: 30 minutos.
- Invalidación de tokens anteriores.
- Consumo dentro de transacción.
- Incremento de `auth_version`.

### Activación de cuentas aprobadas

- La aprobación crea o vincula la cuenta estudiantil.
- Las cuentas nuevas reciben un token de establecimiento de contraseña.
- El token se almacena como hash y vence en 24 horas.
- La entrega se realiza mediante `EmailService` y Resend; no se envían contraseñas.

## 10. Modelo de permisos

| Capacidad | Superuser | Administrator | Teacher | Writer | Student |
|---|---:|---:|---:|---:|---:|
| Crear artículos | Sí | Sí | Sí | Sí | No |
| Administrar cualquier artículo | Sí | Sí | No | No | No |
| Crear cursos | Sí | Sí | Sí | No | No |
| Administrar cualquier curso | Sí | Sí | No | No | No |
| Seguimiento | Sí | Sí | Sí | No | No |
| Listar usuarios | Sí | Sí | No | No | No |
| Crear usuarios | Sí | Sí | No | No | No |
| Cambiar roles | Sí | No | No | No | No |
| Cambiar estados | Sí | Sí | No | No | No |
| Restablecer contraseñas | Sí | No | No | No | No |
| Gestionar postulaciones | Sí | Sí | No | No | No |
| Consultar auditoría | Sí | No | No | No | No |
| Inscribir | Sí | Sí | Sí | No | No |
| Consumir aprendizaje | Sí | Sí | Sí | Sí | Sí |

Los profesores solo administran cursos propios. Los administradores tienen alcance global.

## 11. Modelo de datos

### Identidad

`users`

- Perfil.
- Rol y estado.
- Hash de contraseña.
- Versión de autorización.
- Cambio obligatorio.
- Correo validado mediante el enlace de establecimiento de contraseña.
- MFA cifrado.
- Bloqueo.

`user_sessions`

- Sesiones opacas.
- Caducidad.
- Datos serializados.

### Tokens

- `password_reset_tokens`
- `email_verification_tokens` se conserva únicamente por compatibilidad histórica con P3.

Las tablas de tokens almacenan hashes, expiración y consumo.

### Contenido

`articles`

- Autor.
- Slug.
- Resumen y cuerpo.
- Borrador/publicado.

`courses`

- Creador.
- Slug.
- Descripción.
- Estado.

### Aprendizaje

```text
courses
  └── course_modules
        └── lessons

courses + students
  └── course_enrollments
        ├── lesson_progress
        └── enrollment_support_tracking
```

### Seguimiento

La vista vigente usa `course_enrollments`, `lesson_progress` y
`enrollment_support_tracking`.

- Búsqueda de estudiantes por nombre, correo o curso inscrito.
- Porcentaje derivado de lecciones terminadas / total de lecciones.
- Supervisión, Práctica y asistencia a Terapia por matrícula.
- Observaciones independientes para cada área.
- Profesor limitado a cursos propios; administrador y superusuario con alcance
  global.

`student_tracking` se conserva temporalmente para compatibilidad con registros
globales anteriores, pero no determina el progreso académico calculado.

### Auditoría

`audit_log`

- Actor.
- Acción.
- Recurso.
- IP.
- Detalle JSON.
- Momento.

### Postulaciones

`applications`

- Datos de contacto y perfil de la persona postulante.
- Camino de acompañamiento o profesional de salud.
- Motivación, experiencia y procedencia.
- Consentimientos operativo, de supervisión y de novedades.
- Estado de admisión y observaciones internas.
- Cuenta estudiantil vinculada cuando existe coincidencia de correo.
- Usuario responsable y fecha de revisión.

La creación es pública, con CSRF, validación y rate limit específico. La lectura y revisión requieren la capacidad `application:manage`, asignada únicamente a superusuario y administradores.

Al cambiar el estado a `approved`, una transacción bloquea la postulación, vincula una cuenta estudiantil existente o crea una nueva y registra la auditoría. Las cuentas nuevas reciben una credencial aleatoria desconocida y un token de establecimiento de contraseña almacenado como hash. El token se entrega mediante Resend y vence en 24 horas.

Desde P8 también existe registro público mínimo en `/registro.html`. La cuenta se
crea con rol `student`, permanece sin verificar y no puede iniciar sesión hasta
consumir un token de verificación de correo. La postulación anterior continúa
disponible durante la transición y no se elimina su histórico.

## 12. Integridad y transacciones

Se usan transacciones cuando una operación y su auditoría deben confirmarse juntas:

- Creación de usuarios.
- Cambios de rol/estado.
- Seguimiento.
- Artículos y cursos.
- Contraseñas.
- Módulos y lecciones.
- Inscripciones y progreso.
- Recepción y revisión de postulaciones.

Si falla la auditoría obligatoria, se revierte el cambio.

## 13. Paginación

Los cursores se basan en IDs descendentes:

```sql
WHERE id < ?
ORDER BY id DESC
LIMIT ?
```

Ventajas:

- No degrada como `OFFSET`.
- Reduce duplicados ante inserciones concurrentes.
- Límite máximo de 100.

## 14. Logging y observabilidad

Cada solicitud genera:

```json
{
  "timestamp": "...",
  "level": "info",
  "message": "http_request",
  "requestId": "uuid",
  "method": "GET",
  "path": "/api/...",
  "status": 200,
  "durationMs": 4.2,
  "userId": 12
}
```

Nunca deben registrarse:

- Contraseñas.
- Tokens.
- Secretos MFA.
- Cuerpos de formularios.
- Notas clínicas o de seguimiento.

## 15. Seguridad HTTP

Helmet configura:

- CSP.
- Bloqueo de frames.
- Referrer policy.
- Ocultación tecnológica.

CSP permite:

- Recursos propios.
- Google Fonts.
- Imágenes propias/data.
- Conexiones same-origin.

No se habilita CORS global.

## 16. Rate limiting

| Operación | Límite / 15 min |
|---|---:|
| Login | 10 |
| Postulación pública | 5 |
| Recuperación | 5 |
| API general | 300 |

El rate limit usa IP. `TRUST_PROXY` debe reflejar exactamente la topología controlada.

## 17. Servicios externos

### Correo

`EmailService` desacopla autenticación y admisiones del proveedor.
`ResendEmailProvider` usa el SDK oficial de Resend para:

- Recuperación.
- Establecimiento de contraseña de cuentas aprobadas.
- Mensajes en HTML y texto plano.

### Alertas

El mismo servicio envía alertas seguras para:

- MFA fallido.
- Acceso privilegiado.
- Cambio de rol.
- Cambio de estado.

La aplicación bloquea el arranque productivo si faltan `RESEND_API_KEY`,
`EMAIL_FROM`, `APP_PUBLIC_URL` o los secretos principales. Los webhooks dejaron
de ser una dependencia obligatoria.

## 18. Retención

La política utiliza `DATA_RETENTION_DAYS`.

Modo seguro:

```powershell
npm run retention:dry
```

Modo destructivo autorizado:

```powershell
npm run retention:run
```

La programación debe realizarse con el scheduler del entorno de producción y registrar el resultado.

## 19. Despliegue

Requisitos:

- HTTPS.
- Proxy inverso controlado.
- `NODE_ENV=production`.
- `SESSION_SECRET` robusto.
- `MFA_ENCRYPTION_KEY` independiente.
- Resend configurado con dominio verificado.
- MySQL con privilegios mínimos.

Secuencia:

```powershell
npm ci
npm run migrate:p0
npm run migrate:p1
npm run migrate:p2
npm run migrate:p3
npm run migrate:p4
npm run migrate:p5
npm run migrate:p6
npm run migrate:p7
npm run migrate:p8
npm run lint
npm test
npm audit --omit=dev
npm run check:secrets
npm start
```

## 20. Pruebas y CI

CI valida:

- Sintaxis.
- Pruebas.
- Dependencias.
- Secretos.

Pendientes recomendados:

- Integración con MySQL efímero.
- Matriz HTTP completa por rol.
- Pruebas de recuperación.
- Pruebas end-to-end MFA.
- Pruebas de concurrencia del bloqueo.
- Pruebas de retención sobre datos sintéticos.

### Comprobación formativa de lecciones

Cada lección almacena un video de YouTube, PDF de Google Drive, diapositivas
opcionales y exactamente seis preguntas. Cada pregunta tiene cuatro opciones y
una respuesta correcta. La API de lectura nunca entrega `is_correct` al
navegador. El endpoint de progreso valida las seis selecciones en el servidor y
registra `lesson_progress.completed_at` únicamente cuando todas coinciden.

## 21. Extensión segura

Para añadir una funcionalidad:

1. Definir capacidad.
2. Asignarla a roles.
3. Crear validación.
4. Crear repositorio/servicio.
5. Proteger ruta.
6. Añadir CSRF si muta estado.
7. Usar transacción si requiere auditoría.
8. Crear migración.
9. Añadir pruebas.
10. Actualizar esta documentación.

## 22. Estado funcional actual

### Formación

- Profesores crean y administran únicamente cursos propios.
- Administrador y superusuario tienen alcance global.
- Cada curso contiene módulos y lecciones ordenadas.
- La lección exige título, descripción, duración, video de YouTube, PDF de
  Google Drive, diapositivas opcionales y seis preguntas formativas.
- El contenido de un curso no asignado permanece bloqueado en la API y en la
  interfaz; únicamente se muestra su ficha pública.

### Seguimiento académico

La vista usa un patrón maestro–detalle:

1. búsqueda por nombre, correo o curso;
2. lista de estudiantes;
3. ficha de cuenta y postulación;
4. récord por matrícula;
5. progreso calculado desde `lesson_progress`;
6. Supervisión, Práctica y Terapia almacenadas en
   `enrollment_support_tracking`.

El profesor solo consulta y actualiza matrículas de cursos creados por él.
Administrador y superusuario tienen alcance global. Las observaciones no se
copian al log; la auditoría conserva actor, matrícula, curso, estudiante y
estado de los indicadores.

### Estadísticas administrativas

`GET /api/dashboard/statistics` está protegido con
`requireRole('superuser', 'administrator')` y entrega:

- estudiantes únicos con matrícula activa o completada;
- postulaciones pendientes;
- cursos y artículos creados;
- cuentas de profesor y escritor;
- estudiantes inscritos por curso, excluyendo matrículas retiradas.

### Organización visual

- Blog: editor a la izquierda y artículos recientes a la derecha.
- Formación: herramientas de creación a la izquierda y catálogo a la derecha.
- Seguimiento: inscripción arriba y expediente debajo.
- La landing define la paleta y tipografías compartidas por autenticación,
  paneles, cursos, artículos y páginas legales.

## 23. Migraciones recientes

| Migración | Cambios |
|---|---|
| P4 | postulaciones nativas y admisión |
| P5 | recursos de lección, seis preguntas y opciones |
| P6 | Supervisión, Práctica y Terapia por matrícula (modelo inicial) |
| P7 | Trabajo personal y migración compatible de los datos de Terapia |

Todas son idempotentes. `schema.sql` representa el modelo acumulado para una
instalación nueva.

## 24. Operación en Hostinger

Producción utiliza Node.js 20, Express, MySQL y entrada `src/server.js`.
Hostinger puede iniciar directamente el archivo de entrada sin ejecutar el
hook `prestart`; por ello P5, P6 y P7 se verifican explícitamente al desplegar.

El artefacto no incluye `node_modules`, Git, logs, pruebas ni documentación.
Cuando la plataforma exige configuración en archivo, este se transmite solo
por el canal autenticado, se solicita eliminar el ZIP remoto después de
extraerlo y se borran las copias temporales locales. Las credenciales nunca se
registran en logs ni se incorporan al repositorio.

La comprobación mínima posterior al despliegue es:

```text
GET /                         → 200
GET /login.html               → 200
GET /styles.css               → 200 text/css
GET /api/health               → 200 {"status":"ok"}
GET /api/dashboard/statistics → 401 sin sesión
```
