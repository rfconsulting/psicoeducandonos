# Psicoeducándonos

Landing y plataforma educativa construida con HTML, CSS, JavaScript, Node.js/Express y MySQL.

## Documentación

- [Proceso de desarrollo](docs/PROCESO_DE_DESARROLLO.md)
- [Arquitectura técnica](docs/ARQUITECTURA.md)

## Requisitos

- Node.js 20 o superior.
- MySQL 8 o MariaDB.
- HTTPS para producción.

## Instalación local

1. Copia `.env.example` como `.env`.
2. Reemplaza las credenciales y valores de ejemplo.
3. Crea un usuario MySQL con privilegios únicamente sobre la base de esta aplicación.
4. Ejecuta `database/schema.sql` con una cuenta autorizada para crear la base y sus tablas.
5. Instala las dependencias:

```powershell
npm install
```

6. Aplica las migraciones de seguridad:

```powershell
npm run migrate:p0
npm run migrate:p1
npm run migrate:p2
npm run migrate:p3
npm run migrate:p4
npm run migrate:p5
npm run migrate:p6
npm run migrate:p7
```

7. Crea el primer superusuario siguiendo la sección siguiente.
8. Inicia la aplicación:

```powershell
npm start
```

En desarrollo, la aplicación estará disponible en `http://localhost:3000`.

## Crear el superusuario

El superusuario inicial se crea mediante un script local. No existe registro público para este rol.

Configura temporalmente estas variables en `.env`:

```env
SUPERUSER_NAME=Nombre del administrador
SUPERUSER_EMAIL=correo@dominio.com
SUPERUSER_PASSWORD=UnaClaveMuySegura123!
```

La contraseña debe tener al menos 16 caracteres. Se recomienda utilizar una contraseña única, generada aleatoriamente y guardada en un gestor de contraseñas.

Ejecuta:

```powershell
npm run create-superuser
```

El resultado esperado es:

```text
Superusuario creado o actualizado correctamente.
```

Después de crear la cuenta:

1. Elimina el valor de `SUPERUSER_PASSWORD` del archivo `.env`.
2. No compartas el archivo `.env` ni lo subas al repositorio.
3. Inicia sesión desde `http://localhost:3000/login.html`.

Si vuelves a ejecutar el script con el mismo correo, se actualizarán el nombre, la contraseña y el rol de esa cuenta.

## Acceso al sistema

Todos los roles utilizan el mismo formulario:

```text
http://localhost:3000/login.html
```

El rol nunca se selecciona en el formulario. Express lo obtiene de MySQL después de validar las credenciales.

- `superuser`, `administrator`, `teacher` y `writer` son dirigidos a `/dashboard.html`.
- `student` es dirigido a `/estudiante.html`.

No existe registro público directo. Las personas externas comienzan en `/postulacion.html`; la cuenta `student` se crea o vincula únicamente cuando superusuario o administrador aprueban la postulación.

## Paneles y navegación

El panel adapta su menú al rol autenticado. Las opciones que el usuario no puede utilizar no se muestran y cada endpoint vuelve a comprobar los permisos en Express.

### Sistema visual

La landing define la identidad visual utilizada por toda la aplicación:

- verde profundo `#12312d` y verde principal `#163833`;
- crema `#f3efe5` y papel `#faf8f2` para fondos;
- coral `#e36f55` como acento y llamada a la acción;
- `Newsreader` para títulos y `DM Sans` para interfaz y lectura;
- botones redondeados, bordes verdes translúcidos y foco coral accesible.

`styles.css` contiene la composición específica de la landing y `auth.css`
aplica el mismo sistema a autenticación, paneles, cursos, artículos y páginas
legales. Los colores adicionales del mapa de fases se conservan por su función
semántica.

Panel administrativo:

- **Inicio:** resumen del espacio y alcance del rol.
- **Inicio administrativo:** para `superuser` y `administrator`, muestra estudiantes inscritos, postulaciones pendientes, cursos, artículos, profesores, escritores y el desglose de matrículas por curso.
- **Blog:** visible para `superuser`, `administrator`, `teacher` y `writer`.
- **Formación:** visible para `superuser`, `administrator` y `teacher`.
- **Seguimiento académico:** visible para `superuser`, `administrator` y `teacher`, con búsqueda por nombre o curso, expediente y récord académico.
- **Usuarios:** visible para `superuser` y `administrator`.
- **Postulaciones:** visible para `superuser` y `administrator`.
- **Registro de actividad:** visible exclusivamente para `superuser`.

Panel estudiantil:

- **Cursos disponibles:** catálogo publicado, excluyendo los cursos donde el estudiante ya está inscrito.
- **Mi curso:** inscripciones activas o completadas, acceso al contenido y porcentaje de lecciones completadas.
- **Blog:** artículos publicados por la comunidad.

En pantallas pequeñas, el menú lateral se convierte en una navegación horizontal desplazable.

El lector de artículos también reconstruye la navegación a partir del rol autenticado. Sus enlaces usan fragmentos de URL para regresar directamente a Blog, Formación, Seguimiento, Usuarios, Postulaciones, Actividad, Cursos disponibles o Mi curso, según los permisos correspondientes.

## Permisos

- `superuser`: control completo; asigna roles, crea usuarios, restablece contraseñas temporales, administra cuentas, artículos, cursos, seguimiento y consulta el registro de actividad.
- `administrator`: crea usuarios con roles permitidos, administra estados de cuenta, artículos, cursos y seguimiento.
- `teacher`: crea artículos y cursos, y registra el seguimiento de los estudiantes inscritos en sus propios cursos.
- `writer`: crea y publica artículos del blog.
- `student`: consulta artículos y cursos publicados, accede a sus cursos inscritos y registra el progreso de sus lecciones.

El panel de control está disponible únicamente para `superuser`, `administrator`, `teacher` y `writer`. La protección se aplica en Express, no solamente en la interfaz.

## Seguridad incluida

- Registro público de cuentas deshabilitado; la admisión comienza mediante una postulación.
- Control de acceso basado en roles.
- Contraseñas protegidas con bcrypt y factor de coste 12.
- Política mínima de 12 caracteres para usuarios y 16 para el superusuario inicial.
- Sesiones opacas persistidas en MySQL.
- Cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Renovación del identificador de sesión después del acceso.
- Revalidación del rol, estado y versión de autorización contra MySQL en cada solicitud protegida.
- Invalidación de la sesión al suspender una cuenta, cambiar su rol o rotar las credenciales del superusuario.
- Contraseñas temporales con cambio obligatorio.
- Restablecimiento administrativo de contraseñas exclusivo para el superusuario; invalida las sesiones existentes, desbloquea la cuenta y obliga al usuario a elegir una contraseña personal.
- Recuperación mediante tokens aleatorios de un solo uso, almacenados como hash y con expiración de 30 minutos.
- Límites separados para acceso, postulaciones, recuperación y uso general de la API.
- Borradores restringidos a su propietario, administradores y superusuario.
- Capacidades centralizadas por rol en `src/constants/access.js`.
- Auditoría transaccional para cambios críticos.
- Logs JSON con `requestId` y encabezado `X-Request-Id`.
- Paginación por cursor para usuarios, artículos y cursos.
- MFA TOTP obligatorio para `superuser` y `administrator`.
- Alertas de seguridad por correo transaccional.
- Política de retención ejecutable.
- Protección CSRF y limitación de intentos.
- Bloqueo temporal por múltiples accesos fallidos.
- Helmet, CSP, límites de payload y consultas SQL parametrizadas.
- Auditoría de acciones sensibles.
- Consulta paginada del registro de actividad, protegida exclusivamente para el superusuario.
- Filtros de auditoría parametrizados por responsable, actividad, rol y rango de fechas.
- Mensajes de autenticación que no revelan si una dirección existe.

## Producción

Configura:

```env
NODE_ENV=production
TRUST_PROXY=1
SESSION_SECRET=una-clave-aleatoria-de-al-menos-64-caracteres
```

`TRUST_PROXY=1` solamente debe utilizarse cuando la aplicación esté detrás de un proxy inverso controlado. La aplicación debe publicarse mediante HTTPS y con una cuenta MySQL de privilegios mínimos.

## Correo transaccional y recuperación de contraseñas

La aplicación usa el SDK oficial de Resend detrás de `EmailService`. Configura:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Psicoeducándonos <cuentas@psicoeducandonos.org>
APP_PUBLIC_URL=https://psicoeducandonos.org
SECURITY_ALERT_EMAIL=seguridad@psicoeducandonos.org
```

En producción son obligatorios `RESEND_API_KEY`, `EMAIL_FROM` y
`APP_PUBLIC_URL`. La URL debe contener exclusivamente el origen HTTPS, sin
ruta, query, fragmento ni credenciales. Los mensajes incluyen HTML responsive
y texto plano.

El token conserva el diseño original: 32 bytes aleatorios, SHA-256 en MySQL,
un solo uso y 30 minutos de vigencia. No se registran el token, el enlace
completo ni la dirección del destinatario. Las respuestas del endpoint son
genéricas incluso cuando Resend falla.

## Pruebas

```powershell
npm test
npm audit --omit=dev
```

## Modelo académico

Los cursos pueden contener:

- Módulos ordenados.
- Lecciones ordenadas con título, descripción, video de YouTube y duración.
- PDF obligatorio y diapositivas opcionales mediante enlaces de Google Drive.
- Seis preguntas formativas de selección simple, con cuatro opciones cada una.
- Inscripciones de estudiantes.
- Progreso por lección.

Las preguntas no asignan calificación. El servidor conserva las respuestas
correctas y solamente registra la lección como terminada cuando el estudiante
responde correctamente las seis. Si alguna respuesta requiere revisión, la
lección permanece pendiente y el estudiante puede intentarlo nuevamente.

Profesores administran únicamente los cursos que crearon. Administradores y superusuario tienen alcance global. Los estudiantes solo pueden registrar progreso en lecciones de cursos donde tengan una inscripción activa.

El seguimiento académico calcula el porcentaje a partir de las lecciones
terminadas respecto del total de lecciones del curso. La ficha del estudiante
incluye los datos disponibles de su cuenta y postulación. Cada matrícula
mantiene un registro independiente de Supervisión, Práctica y Trabajo
personal, con un indicador de cumplimiento y observaciones. El profesor solo
puede consultar y actualizar estos campos en cursos creados por él; el
administrador y el superusuario tienen alcance global.

En “Mi curso”, el estudiante visualiza el estado de Supervisión, Práctica y
Trabajo personal como indicadores de solo lectura. Las observaciones internas
y la identidad del responsable no se incluyen en la respuesta estudiantil.

## Postulaciones al diplomado

La landing enlaza al formulario nativo en `/postulacion.html`. Recoge datos de contacto, camino formativo, experiencia, motivación, procedencia y consentimientos. La autorización para gestionar la postulación y el compromiso de supervisión son obligatorios; la suscripción a novedades es independiente y opcional.

Las solicitudes se almacenan en `applications`. Si ya existe una cuenta estudiantil con el mismo correo, queda vinculada automáticamente. Superusuario y administradores pueden filtrar por nombre, correo, estado o camino formativo y asignar los estados pendiente, en revisión, aprobada, lista de espera o rechazada.

Al aprobar una postulación sin cuenta vinculada, el sistema crea la cuenta estudiantil con una credencial aleatoria no utilizable y genera un enlace de establecimiento de contraseña con vigencia de 24 horas. El enlace se entrega mediante Resend. No se envían contraseñas temporales. Si la cuenta ya existe, la aprobación solamente realiza la vinculación.

Las observaciones son internas y cada revisión registra al usuario responsable en `audit_log`.

```text
POST  /api/applications
GET   /api/applications?search=&status=&pathway=&limit=&cursor=
PATCH /api/applications/:id/review
```

Endpoints principales:

```text
POST  /api/learning/courses/:courseId/modules
POST  /api/learning/modules/:moduleId/lessons
POST  /api/learning/courses/:courseId/enrollments
GET   /api/learning/courses/:courseId/structure
GET   /api/learning/enrollments/my
PATCH /api/learning/lessons/:lessonId/progress
PATCH /api/content/courses/:id
PATCH /api/learning/modules/:moduleId
PATCH /api/learning/lessons/:lessonId
```

## Registro de actividad

La tabla `audit_log` registra las acciones relevantes con su responsable, objetivo y fecha. El panel permite al superusuario consultar el historial desde la sección **Registro de actividad**.

Filtros disponibles:

- Nombre o correo del responsable.
- Tipo de actividad.
- Rol del responsable.
- Fecha inicial y final.

Los filtros se ejecutan en MySQL mediante parámetros y pueden combinarse con la paginación por cursor. La API no entrega al navegador direcciones IP ni el JSON interno de detalles.

Endpoint:

```text
GET /api/audit-log?responsible=&action=&role=&dateFrom=&dateTo=&limit=30&cursor=
```

La capacidad `audit:view` pertenece únicamente a `superuser`. Ocultar el menú no constituye el control de seguridad: el servidor rechaza también cualquier consulta directa realizada por otro rol.

## Logging

Cada solicitud recibe un UUID en el encabezado `X-Request-Id`. Los logs son JSON y contienen método, ruta sin query string, estado, duración y usuario autenticado cuando corresponda. No deben registrarse contraseñas, tokens ni cuerpos de solicitudes.

## Paginación

Los listados aceptan:

```text
?limit=30&cursor=123
```

La respuesta incluye `nextCursor`. El límite máximo es 100 elementos por solicitud. Este mecanismo se utiliza en usuarios, artículos, cursos y registro de actividad.

## MFA para cuentas privilegiadas

Configura una clave AES de 32 bytes representada por 64 caracteres hexadecimales:

```env
MFA_ENCRYPTION_KEY=
```

Puedes generarla con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Superusuarios y administradores son dirigidos a `/mfa.html` después de validar su contraseña. En el primer acceso escanean un código QR generado localmente por el servidor o registran la clave manual en una aplicación TOTP; en accesos posteriores introducen el código de seis dígitos. El secreto no se envía a servicios externos para generar el QR.

## Alertas de seguridad

Si `SECURITY_ALERT_EMAIL` está configurado, Resend entrega alertas para accesos
privilegiados, códigos MFA fallidos y cambios de rol o estado. Los mensajes no
incluyen contraseñas, tokens ni secretos MFA.

## Retención y privacidad

`DATA_RETENTION_DAYS` controla la conservación de notas de seguimiento y auditoría; el valor predeterminado es 730 días.

Primero revisa qué se eliminaría:

```powershell
npm run retention:dry
```

Para aplicar la política:

```powershell
npm run retention:run
```

La ejecución elimina tokens usados o expirados, borra eventos de auditoría vencidos y anonimiza las notas antiguas estableciéndolas en `NULL`.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push y pull request:

- Instalación reproducible con `npm ci`.
- Validación sintáctica de JavaScript.
- Pruebas automatizadas.
- Auditoría de dependencias.
- Escaneo de patrones de secretos.

## Despliegue en Hostinger

La aplicación productiva utiliza Node.js 20, Express y `src/server.js` como
archivo de entrada. Para instalaciones nuevas o cambios de modelo ejecuta:

```powershell
npm run db:init
npm run migrate:p5
npm run migrate:p6
npm run migrate:p7
```

En producción configura `NODE_ENV=production`, `TRUST_PROXY=1`,
`APP_PUBLIC_URL=https://psicoeducandonos.org` y las credenciales de la base
MySQL asignada al dominio. En una ejecución normal, `npm start` invoca
`prestart`; el despliegue de aplicaciones JavaScript de Hostinger inicia
directamente `src/server.js`, por lo que las migraciones deben verificarse
explícitamente durante el despliegue.

También son obligatorios la API key de Resend y un remitente perteneciente a
un dominio verificado. No deben publicarse en Git ni reutilizarse como
contraseñas.

El comando `npm run build:hostinger` prepara en `artifacts/` un directorio con
el código estrictamente necesario, comprueba que no contenga secretos y elimina
siempre su área temporal. El artefacto no incluye `.env`, credenciales de
bootstrap ni scripts administrativos. Configura todas las variables de
producción externamente en Hostinger.

Comprime únicamente el contenido del directorio validado, súbelo por el canal
autenticado de Hostinger y elimina la copia remota después de extraerla. La
carpeta `artifacts/` está excluida de Git.

Validación previa:

```powershell
npm test
npm run lint
npm audit --omit=dev
npm run check:secrets
```

Validación posterior:

- `/` responde `200` y muestra la landing del diplomado.
- `/login.html` responde `200`.
- `/styles.css` se entrega como `text/css`.
- `/api/health` responde `200` con `{"status":"ok"}`.
- `/api/dashboard/statistics` responde `401` sin sesión.

El despliegue incluye:

- Redirección permanente a HTTPS y al dominio canónico.
- Encabezados de seguridad mediante Helmet y cookies seguras.
- `robots.txt`, `sitemap.xml`, enlaces canónicos y páginas de privacidad y
  términos.
- DMARC y CAA en DNS. La política DMARC comienza en modo de observación
  (`p=none`) y debe endurecerse después de revisar los reportes.

Antes de cada despliegue se debe conservar una copia recuperable y comprobar
inicio de sesión, postulación, correo transaccional, MFA y conexión MySQL.
