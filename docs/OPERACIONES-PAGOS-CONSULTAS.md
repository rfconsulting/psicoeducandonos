# Operaciones, pagos, consultas y suscripciones

## Alcance

La migración P25 incorpora el catálogo de servicios, habilitaciones por
profesional, solicitudes de consulta, comprobantes de transferencias,
notificaciones, progreso administrativo de consultas y suscripciones.

El progreso de Historia Clínica se limita deliberadamente a estados
administrativos. El sistema no almacena diagnósticos, notas terapéuticas,
observaciones clínicas ni contenido de sesiones.

## Instalación y migración

Para actualizar y para comprobar que las migraciones son repetibles:

```powershell
npm run db:migrate
npm run db:verify
```

P25 es idempotente. Crea o completa `service_type_catalog`,
`professional_service_authorizations`, `service_requests`, `notifications`,
`payment_receipts`, `clinical_record_progress`, `subscription_plans` y
`subscriptions`.

En `payments` diferencia:

- `payment_method`: canal utilizado, por ejemplo transferencia manual;
- `currency` y `amount_minor`: moneda e importe efectivamente cobrados;
- `reference_currency` y `reference_amount_minor`: moneda e importe usados
  como referencia comercial o contable.

## Catálogo y checklist profesional

Los tipos de servicio se definen en `service_type_catalog`. La administración
habilita cada tipo mediante `professional_service_authorizations`. Un servicio
profesional solo puede crearse y permanecer activo si su tipo está autorizado.

```text
GET /api/operations/service-types
GET /api/operations/professionals/:professionalId/authorizations
PUT /api/operations/professionals/:professionalId/authorizations
```

La escritura requiere capacidad de gestión de agenda y token CSRF.

## Solicitudes de consulta

El estudiante indica tipo de servicio, modalidad, formato de participantes,
categoría general del motivo, zona horaria y profesional preferido. Los
indicadores de riesgo llevan la solicitud a `safety_review`; este flujo no
sustituye servicios de emergencia ni realiza evaluación clínica automática.

```text
POST /api/operations/service-requests
GET  /api/operations/service-requests/my
```

## Pagos y comprobantes

PayPal procesa USD y Mercado Pago procesa ARS cuando el proveedor está
configurado. Las transferencias manuales crean primero una orden pendiente:

```text
POST /api/operations/courses/:courseId/manual-order
POST /api/operations/consultation-holds/:holdId/manual-order
```

El comprobante se carga como cuerpo binario:

```text
POST /api/operations/orders/:reference/receipt
Content-Type: image/jpeg | image/png | image/webp | application/pdf
X-File-Name: comprobante.pdf
X-CSRF-Token: ...
```

El límite es 5 MB. El servidor comprueba la firma binaria real y que coincida
con `Content-Type`; no confía únicamente en la extensión.

```text
GET   /api/operations/payment-receipts
GET   /api/operations/payment-receipts/:id/file
PATCH /api/operations/payment-receipts/:id/review
```

Una aprobación confirma orden y pago. Para cursos crea o reactiva la
matrícula; para consultas confirma una cita pendiente solo si su ventana de
pago sigue vigente. La decisión genera auditoría, notificación y correo.

## Notificaciones y recordatorios

```text
GET   /api/operations/notifications
PATCH /api/operations/notifications/:id/read
```

El recordatorio se ejecuta con:

```powershell
npm run notifications:pending-consultations
```

Debe programarse una vez al día. Busca solicitudes pendientes de más de 24
horas y evita repetir el mismo recordatorio diariamente. La notificación
interna se conserva aunque falle el proveedor de correo.

Ejemplo cron:

```cron
15 12 * * * cd /ruta/aplicacion && npm run notifications:pending-consultations
```

## Progreso administrativo

Estados: `not_started`, `intake_pending`, `in_progress`, `follow_up` y
`closed`.

```text
GET   /api/operations/appointments/manage
PATCH /api/operations/appointments/:reference/clinical-progress
```

Cada cambio registra responsable y fecha, genera auditoría y notifica al
estudiante. No existe un campo libre para información clínica.

## Suscripciones

```text
GET  /api/operations/subscription-plans
POST /api/operations/subscription-plans
GET  /api/operations/subscriptions/my
POST /api/operations/subscriptions
PATCH /api/operations/subscriptions/:reference/cancel
```

El modelo guarda plan, proveedor, estado, identificador externo y fechas del
ciclo. Actualmente administra el catálogo y estado local; no crea por sí solo
acuerdos recurrentes remotos. Para el cobro automático deben configurarse
planes en PayPal o Mercado Pago y completar la vinculación de identificadores
y webhooks.

## Verificación previa al despliegue

```powershell
npm run db:verify
npm test
npm run lint
npm run check:secrets
npm run build:hostinger
```

Después del despliegue prueba: habilitación profesional, solicitud y reserva,
orden manual, carga y aprobación de comprobante, confirmación de matrícula o
cita, progreso administrativo, notificaciones y ejecución manual del trabajo
de consultas pendientes.
