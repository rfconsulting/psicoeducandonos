# Contratos de dominio

## Lenguaje ubicuo

| Término | Significado y fuente de verdad |
|---|---|
| Cuenta | Identidad autenticable en `users`; no expresa admisión ni matrícula. |
| Perfil estudiantil | Datos aportados para elegibilidad; `student_profiles`. |
| Revisión | Decisión administrativa inmutable sobre un perfil. |
| Producto | Referencia comercial a algo vendible, curso o consulta. |
| Precio | Importe y moneda vigentes de un producto. |
| Orden | Intención de compra con snapshot comercial. |
| Pago | Resultado informado por un proveedor y verificado en servidor. |
| Matrícula | Derecho académico de acceso a un curso. |
| Profesional | Usuario habilitado para ofrecer uno o más servicios. |
| Servicio | Tipo y duración de consulta ofrecida por un profesional. |
| Hold | Bloqueo temporal y exclusivo de una franja mientras se paga. |
| Cita | Reserva de un servicio con horario y estado propios. |

## Límites del dominio

```text
Identity -> Student Onboarding -> Academic
    |                |               ^
    |                v               |
    +------------> Catalog -> Commerce
                         |       |
                         v       v
                     Scheduling <-+

Todos -> Notifications / Audit / Observability
```

- Identity no conoce pagos, matrículas ni citas.
- Onboarding decide elegibilidad, no concede acceso académico.
- Commerce confirma valor monetario, no implementa el aula ni la agenda.
- Academic crea matrícula solo desde una fuente autorizada e idempotente.
- Scheduling controla disponibilidad y exclusión temporal.

## Estados canónicos

### Cuenta

`active | suspended`

La verificación se representa con `email_verified_at`, no con otro significado
de `status`.

### Perfil estudiantil

`draft -> submitted -> under_review -> approved`

Transiciones alternativas:

- `under_review -> changes_requested -> submitted`
- `under_review -> rejected`
- `approved -> under_review` solo mediante reapertura administrativa auditada.

Editar datos materiales tras aprobación debe reabrir revisión. La lista exacta
de campos materiales se define en la iteración de perfil.

### Orden

`pending -> processing -> paid | cancelled | expired`

Desde `paid` puede evolucionar a `partially_refunded | refunded`. Una orden no
vuelve de `paid` a `pending`.

### Pago

`pending -> approved | rejected | cancelled`

Un pago aprobado puede registrar reembolsos sin borrar el evento original.

### Matrícula

`active -> completed | withdrawn`

Reactivar crea un evento y conserva origen. Fuentes:
`admin | free_self | paid | legacy`.

### Cita

`held -> pending_payment -> confirmed -> completed`

Salidas alternativas:
`expired | cancelled_by_client | cancelled_by_professional | no_show | refunded`.
La reprogramación se registra como evento con horario anterior y nuevo.

## Modelo objetivo mínimo

```text
users 1---0..1 student_profiles 1---* student_profile_reviews
users 1---0..1 professional_profiles 1---* professional_services
courses 1---1 products 1---* product_prices
professional_services 1---1 products
orders 1---* order_items
orders 1---* payments 1---* payment_events
orders 1---0..* course_enrollments
professional_services 1---* appointments
appointments 1---* appointment_events
```

Los nombres físicos y restricciones definitivas se validarán por migración. No
se usarán relaciones polimórficas sin claves foráneas para conectar productos.

## Reglas invariantes

1. Cuenta activa no equivale a perfil aprobado.
2. Perfil aprobado no equivale a matrícula.
3. Pago aprobado no se infiere desde una URL de retorno.
4. Una matrícula pagada referencia la orden que la originó.
5. Un evento externo se procesa una sola vez por proveedor e identificador.
6. Una franja incompatible no puede tener dos citas activas del mismo profesional.
7. Holds expiran y su liberación es idempotente.
8. Importes se almacenan en unidades menores enteras y con moneda.
9. `applications` permanece como fuente histórica, no como núcleo nuevo.
10. Auditoría no contiene contraseñas, tokens, documentos ni notas clínicas.

## Compatibilidad de datos

- Los usuarios y matrículas existentes conservan sus identificadores.
- Registros derivados de `applications` guardan referencia de procedencia.
- La migración crea perfiles sin eliminar ni reescribir postulaciones.
- `legacy` identifica matrículas cuyo origen anterior no puede reconstruirse.
- Toda migración debe ser reejecutable, respaldada y validada con conteos antes y
  después.

