# Proceso de desarrollo de Psicoeducándonos

## 1. Propósito del documento

Este documento registra la evolución técnica y funcional de Psicoeducándonos desde su inicio como landing page hasta la plataforma educativa y administrativa actual.

Su finalidad es:

- Conservar las decisiones y motivaciones del desarrollo.
- Facilitar la incorporación de nuevos desarrolladores.
- Relacionar cada fase con los archivos, migraciones y controles resultantes.
- Evitar que futuras modificaciones reviertan decisiones de seguridad.
- Servir como base para auditorías y planificación.

El proyecto se desarrolló de forma incremental durante julio de 2026. No se reconstruyó desde cero al añadir el backend: cada etapa extendió la anterior.

## 2. Visión inicial

El punto de partida fue una landing para presentar el:

> Diplomado en Fundamentos del Acompañamiento en Crisis, Trauma y Salud Mental Comunitaria desde una Perspectiva Cristiana.

La comunicación debía explicar que el proyecto no era solamente un curso, sino una red de acompañamiento compuesta por:

- Personas que acompañan desde la presencia, independientemente de su profesión.
- Profesionales de salud mental que aportan el cuidado clínico.
- Supervisión y trabajo paralelo alrededor de una misma persona.

### Resultado inicial

Se creó una landing estática con:

- HTML semántico.
- CSS responsive.
- JavaScript sin framework.
- Navegación móvil.
- Animaciones con `IntersectionObserver`.
- Horarios regionales.
- Descarga de evento en formato iCalendar.
- Diseño visual construido con CSS.

Archivos principales:

```text
public/index.html
public/styles.css
public/script.js
public/assets/logo.png
```

## 3. Incorporación del mapa de acompañamiento

La propuesta académica se amplió con tres fases:

1. Seguridad y Estabilización.
2. Procesamiento del Duelo y del Trauma.
3. Integración y Reconexión.

También se incorporó la “compuerta” entre las fases 1 y 2, y los dos carriles paralelos:

- APE: Acompañamiento Post-Estabilización.
- ICT: Intervención Clínica del Trauma.

### Decisión de implementación

El mapa se convirtió en contenido HTML accesible y responsive, en lugar de incrustarlo únicamente como imagen. Esto permite:

- Lectura por tecnologías de asistencia.
- Indexación.
- Adaptación móvil.
- Actualización de textos sin editar una imagen.

## 4. Conversión a una aplicación web

La landing evolucionó hacia una aplicación con:

- Node.js 20 o superior.
- Express 5.
- MySQL 8 o MariaDB.
- Sesiones almacenadas en MySQL.
- Frontend HTML, CSS y JavaScript.

Se preservó el enfoque sin framework de frontend para mantener una base simple.

### Estructura inicial del backend

```text
src/
  config/
  middleware/
  routes/
  services/
  server.js
database/
scripts/
public/
```

Se añadieron:

- `package.json` y lockfile reproducible.
- `.env.example`.
- `.gitignore`.
- `database/schema.sql`.
- Script para crear el superusuario.

## 5. Autenticación y roles

Se definieron cinco roles:

- `superuser`
- `administrator`
- `teacher`
- `writer`
- `student`

### Decisiones centrales

- Todos usan el mismo formulario de acceso.
- El rol nunca se selecciona durante el login.
- El rol se obtiene desde MySQL después de validar la contraseña.
- No existe registro público directo; las cuentas estudiantiles nacen de postulaciones aprobadas.
- Administradores no pueden crear ni promover superusuarios.
- Solo el superusuario puede cambiar roles.

### Redirección por tipo de usuario

```text
superuser/administrator/teacher/writer → /dashboard.html
student                                → /estudiante.html
```

Para cuentas privilegiadas, P3 añade una etapa MFA antes de entrar al panel.

## 6. Primer panel y gestión de usuarios

El panel se construyó por capacidades:

- Escritores: artículos.
- Profesores: artículos, cursos y seguimiento.
- Administradores: artículos, cursos, seguimiento y usuarios.
- Superusuario: acceso total.
- Estudiantes: espacio de lectura independiente.

Se implementó:

- Creación de usuarios.
- Activación y suspensión.
- Asignación de roles.
- Contraseñas temporales.
- Seguimiento con etapa, progreso y observaciones.

## 7. Blog y cursos

La primera versión de contenido permitió:

- Crear artículos como borrador o publicados.
- Crear fichas de cursos.
- Mostrar contenido publicado a estudiantes.
- Restringir borradores al autor, administradores y superusuario.
- Leer artículos completos por slug.

Posteriormente P2 convirtió los cursos en un modelo académico:

- Módulos ordenados.
- Lecciones ordenadas.
- Contenido de lección.
- Duración estimada.
- Inscripciones.
- Progreso por lección.

## 8. Auditoría inicial de seguridad

Se realizó una auditoría exclusivamente de lectura sobre:

- Autenticación.
- Autorización.
- Sesiones.
- CSRF.
- SQL.
- Frontend.
- Dependencias.
- Esquema.
- Configuración.
- README.

### Hallazgos principales

- El rol y estado quedaban congelados en la sesión.
- Existía una cadena con apariencia de credencial en `.env.example`.
- El contador de intentos tenía una condición de carrera.
- No había recuperación de cuenta.
- Las contraseñas temporales no requerían cambio.
- Los borradores tenían visibilidad demasiado amplia.
- No existían migraciones ni pruebas.
- Los cursos no tenían estructura académica real.
- No existían MFA, verificación de correo, alertas ni retención.

La remediación se organizó en P0, P1, P2 y P3.

## 9. P0: remediación inmediata

Objetivo: cerrar los riesgos que bloqueaban cualquier despliegue.

### Cambios

- Eliminación de la cadena sospechosa del archivo de ejemplo.
- Incorporación de `users.auth_version`.
- Revalidación del usuario contra MySQL en cada ruta protegida.
- Invalidación de sesión al:
  - Suspender una cuenta.
  - Cambiar su rol.
  - Rotar sus credenciales.
- Migración idempotente `migrate:p0`.

### Decisión

La sesión conserva datos mínimos para rendimiento, pero esos datos no se consideran autoridad. `security.js` comprueba:

- Existencia del usuario.
- Estado activo.
- Rol actual.
- Versión de autorización.

## 10. P1: endurecimiento previo a producción

Objetivo: completar los controles básicos de identidad y autenticación.

### Cambios

- Actualización atómica de intentos fallidos.
- Rate limits independientes.
- Cambio obligatorio de contraseñas temporales.
- Recuperación con tokens:
  - 32 bytes aleatorios.
  - Hash SHA-256 en MySQL.
  - Un solo uso.
  - Expiración de 30 minutos.
- En la primera versión se usó un webhook HTTPS para entregar correos; este
  mecanismo fue sustituido posteriormente por `EmailService` y Resend.
- Validación estricta de variables.
- Restricción de borradores por propiedad.
- Endpoint para leer artículos completos.
- Límite de payload coherente de 64 KB.
- Respuestas 400 y 413 correctas.
- Primera suite con `node:test`.
- Migración `migrate:p1`.

### Decisión sobre proveedores

El envío transaccional utiliza `EmailService`, que mantiene autenticación y
postulaciones desacopladas del SDK. `ResendEmailProvider` implementa el envío
real; las pruebas inyectan un proveedor falso y nunca contactan servicios
externos.

En producción son obligatorios la API key de Resend, el remitente y la URL
pública.

## 11. P2: arquitectura y modelo académico

Objetivo: reducir duplicación, añadir trazabilidad y desarrollar cursos reales.

### Cambios de arquitectura

- Roles y capacidades centralizados.
- Middleware `requireCapability`.
- Repositorio para listados de contenido.
- Utilidad común de paginación.
- Transacciones reutilizables.
- Auditoría obligatoria dentro de transacciones críticas.
- Logs JSON.
- UUID por solicitud mediante `X-Request-Id`.

### Modelo académico

Se añadieron:

- `course_modules`
- `lessons`
- `course_enrollments`
- `lesson_progress`

### Reglas

- Profesores administran cursos propios.
- Administradores y superusuario tienen alcance global.
- Solo estudiantes inscritos actualizan progreso.
- Las relaciones se validan en el servidor.

### Paginación

Los listados dejaron de depender de límites fijos globales y adoptaron:

```text
?limit=30&cursor=123
```

## 12. P3: controles operativos y privacidad

Objetivo: añadir controles propios de una operación productiva.

### MFA

- Obligatorio para `superuser` y `administrator`.
- Compatible con TOTP.
- Clave TOTP cifrada con AES-256-GCM.
- Ventana temporal de ±30 segundos.
- La sesión privilegiada no se habilita hasta validar MFA.

### Verificación de correo

- En P3, los nuevos registros públicos quedaban sin verificar; este flujo fue retirado posteriormente por P4.
- Token aleatorio de un solo uso.
- Hash almacenado en MySQL.
- Vigencia de 24 horas.
- Reenvío con respuesta no enumerativa.
- Las cuentas existentes fueron marcadas como verificadas durante la migración.

### Alertas

Se añadieron eventos para:

- Código MFA fallido.
- Acceso privilegiado.
- Cambio de rol.
- Activación o suspensión.

La entrega se realiza mediante `EmailService` y el adaptador de Resend.

### Retención

Se incorporó:

```powershell
npm run retention:dry
npm run retention:run
```

La ejecución:

- Anonimiza notas antiguas.
- Elimina auditorías vencidas.
- Elimina tokens expirados o utilizados.

### Integración continua

GitHub Actions ejecuta:

- `npm ci`
- Validación sintáctica.
- Pruebas.
- `npm audit`.
- Escaneo de secretos.

## 13. Migraciones

Las migraciones se diseñaron para ser repetibles:

| Migración | Objetivo |
|---|---|
| `migrate:p0` | `auth_version` |
| `migrate:p1` | contraseñas temporales y recuperación |
| `migrate:p2` | modelo académico |
| `migrate:p3` | MFA y verificación de correo |
| `migrate:p4` | postulaciones nativas |
| `migrate:p5` | recursos y comprobación formativa de lecciones |
| `migrate:p6` | acompañamiento por matrícula |
| `migrate:p7` | Trabajo personal y compatibilidad con datos históricos |

Orden requerido:

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

`schema.sql` representa el esquema completo para instalaciones nuevas.

## 14. Estrategia de pruebas

La suite actual comprueba:

- Normalización de nombres y correos.
- Validación de correos.
- Política de contraseñas.
- Matriz básica de capacidades.
- Cursores y límites.
- Cifrado/descifrado MFA.
- Vectores TOTP.

Comandos:

```powershell
npm run lint
npm test
npm audit --omit=dev
npm run check:secrets
```

## 15. Decisiones que deben preservarse

1. Mantener deshabilitado el registro público directo de cuentas.
2. Nunca confiar únicamente en datos de la sesión.
3. Mantener SQL parametrizado.
4. Usar transacción con auditoría en cambios críticos.
5. No registrar contraseñas, tokens, cuerpos o secretos MFA.
6. No publicar producción sin Resend configurado, HTTPS y clave MFA.
7. Ejecutar retención primero en modo simulación.
8. Añadir toda evolución del esquema como migración.

## 16. P4: postulaciones nativas

El formulario externo de inscripción fue analizado y convertido en un módulo nativo para evitar fragmentar la información académica entre Google Forms y MySQL.

P4 incorporó:

- Formulario público en `/postulacion.html`.
- Rangos de edad sin superposición.
- Consentimiento operativo obligatorio separado del consentimiento opcional de novedades.
- Preguntas condicionales para la clase informativa.
- Tabla `applications` con estados de admisión.
- Vinculación automática por correo con cuentas estudiantiles existentes.
- Panel de revisión para superusuario y administradores.
- Filtros por identidad, estado y camino formativo.
- Observaciones internas y responsable de revisión.
- Auditoría de recepción y revisión.
- Límite específico contra envíos públicos abusivos.
- Eliminación del registro público directo de estudiantes.
- Creación o vinculación de la cuenta únicamente al aprobar.
- Enlace seguro de 24 horas para que la persona aprobada establezca su contraseña.

## 17. Limitaciones actuales

- El correo transaccional depende de Resend.
- Las alertas por correo dependen de Resend.
- No se generan códigos de recuperación MFA.
- No existe interfaz para editar o reordenar contenido ya creado.
- La cobertura de pruebas todavía es inicial.
- No hay pruebas end-to-end automatizadas con un MySQL efímero.
- La UI utiliza campos numéricos para algunos identificadores académicos.

Estas limitaciones deben entrar en el roadmap antes de una operación a gran escala.

## 18. P5: estructura completa de lecciones

Se reemplazó la lección de texto simple por una unidad formativa con:

- título y descripción;
- duración estimada;
- video HTTPS de YouTube;
- PDF obligatorio de Google Drive;
- diapositivas opcionales de Google Drive;
- seis preguntas de selección simple;
- cuatro opciones por pregunta;
- una única respuesta correcta.

El servidor valida enlaces, estructura y respuestas. Las respuestas correctas
no se entregan al navegador. La lección solo se marca terminada cuando las seis
selecciones coinciden, sin calificación numérica.

También se bloqueó el acceso al contenido de cursos no asignados tanto en la
API como en el dashboard estudiantil. El título y la descripción pueden
permanecer visibles como catálogo, pero no existe enlace funcional a la clase.

## 19. P6: seguimiento académico por matrícula

El seguimiento global manual resultaba insuficiente cuando un estudiante
participaba en varios cursos. Se introdujo
`enrollment_support_tracking`, relacionado uno a uno con
`course_enrollments`.

La nueva vista permite:

- buscar por nombre, correo o curso;
- seleccionar un estudiante y abrir su expediente;
- consultar datos disponibles de cuenta y postulación;
- calcular progreso desde lecciones terminadas / total de lecciones;
- registrar Supervisión, Práctica y Trabajo personal por curso;
- guardar observaciones independientes;
- auditar responsable e indicadores sin copiar notas sensibles.

Profesores están limitados a sus cursos. Administrador y superusuario tienen
alcance global.

## 20. Reorganización del dashboard

Se organizó la interfaz por tareas:

- Blog muestra editor a la izquierda y artículos recientes a la derecha,
  ordenados por ID descendente.
- Formación muestra creación de curso, módulo y lección a la izquierda y
  catálogo de cursos a la derecha.
- Inscribir estudiante se trasladó desde Formación a la cabecera de
  Seguimiento.
- Postulaciones abre por defecto únicamente la cola pendiente; los demás
  estados siguen disponibles como consulta histórica.
- El tema visual de la landing se extendió a autenticación, dashboard, cursos,
  artículos, postulación y páginas legales.

## 21. Estadísticas administrativas

Se añadió `GET /api/dashboard/statistics`, accesible solo por superusuario y
administrador. El Inicio presenta:

- estudiantes únicos inscritos;
- postulaciones pendientes;
- cursos creados;
- artículos creados;
- profesores;
- escritores;
- matrículas activas o completadas por curso.

La ruta excluye matrículas retiradas y rechaza solicitudes sin una sesión
privilegiada.

## 22. Despliegue productivo en Hostinger

El proyecto quedó desplegado como aplicación Express con Node.js 20,
`src/server.js` y MySQL asignado a `psicoeducandonos.org`.

El procedimiento consolidado es:

1. verificar claves requeridas sin imprimir valores;
2. ejecutar pruebas, lint, auditoría y escaneo de secretos;
3. construir el artefacto sin `node_modules`, Git, logs, pruebas ni docs;
4. comprobar P5 y P6 explícitamente;
5. desplegar por el canal autenticado de Hostinger;
6. solicitar la eliminación del ZIP remoto;
7. reiniciar Node.js;
8. verificar landing, login, CSS, `/api/health` y protección de APIs;
9. eliminar archivos y directorios temporales locales.

Durante esta etapa se corrigió `build-hostinger-archive.js`: `DB_NAME` y
`DB_USER` se leen del `.env` actual en vez de usar identificadores antiguos
fijados en código.

## 23. Estado verificado

Al 25 de julio de 2026:

- landing productiva disponible;
- login disponible;
- CSS servido con MIME correcto;
- API y conexión MySQL saludables;
- estadísticas protegidas sin sesión;
- 26 pruebas automatizadas aprobadas;
- 61 archivos JavaScript validados;
- 0 vulnerabilidades reportadas por `npm audit --omit=dev`.
