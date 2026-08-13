# Modelo de amenazas inicial

## Datos sensibles

- Identidad y contacto.
- Documentos y credenciales profesionales.
- Estado y motivos de revisión.
- Órdenes, referencias de pago y reembolsos.
- Agenda de consultas, cuya existencia ya puede revelar información sensible.

Historia clínica, diagnóstico y notas terapéuticas quedan fuera del sistema.

## Amenazas y controles requeridos

| ID | Amenaza | Impacto | Control y evidencia |
|---|---|---|---|
| T01 | Registro automatizado o enumeración | Abuso/privacidad | Rate limit, respuesta genérica y pruebas temporales. |
| T02 | Acceso horizontal a perfiles/documentos | Alto | Alcance por recurso y pruebas con otro usuario. |
| T03 | Elevación por estado enviado por cliente | Alto | Estado cargado desde MySQL en cada operación. |
| T04 | Archivo malicioso | Alto | Tipos permitidos, tamaño, nombre opaco, acceso privado y escaneo. |
| T05 | Falsificación o repetición de webhook | Crítico | Firma, timestamp, secreto separado, ID único e idempotencia. |
| T06 | Alteración de importe/moneda | Crítico | Precio resuelto en servidor y snapshot de orden. |
| T07 | Doble matrícula o doble cita | Alto | Transacción, claves únicas/bloqueo y prueba concurrente. |
| T08 | Hold permanente | Medio | Expiración UTC, job idempotente y métrica de atraso. |
| T09 | Exposición en logs/auditoría | Alto | Allowlist de campos y pruebas de ausencia. |
| T10 | SSRF mediante URL de proveedor | Alto | Hosts/configuración permitidos; no aceptar callback URL arbitraria. |
| T11 | CSRF en mutaciones de usuario | Alto | Token CSRF y SameSite; webhook usa autenticación propia. |
| T12 | Cuenta privilegiada comprometida | Crítico | MFA, sesión revalidada, mínimo privilegio y auditoría. |
| T13 | Datos retenidos indefinidamente | Alto | Política por categoría y jobs dry-run/execute. |
| T14 | Pago aprobado sin entrega o viceversa | Alto | Outbox/reintento idempotente, conciliación y alertas. |

## Límites de confianza

1. Navegador: nunca confiable para precio, estado, rol o disponibilidad.
2. Proxy: `TRUST_PROXY` coincide exactamente con infraestructura controlada.
3. Correo: canal de entrega, no prueba permanente de identidad.
4. Proveedor de pago: se confía solo tras validar firma y consultar datos
   necesarios del evento.
5. Jobs: cuentan con identidad y permisos mínimos separados del usuario web.

## Riesgos que requieren decisión humana

- Base legal y retención por país.
- Acceso operativo a documentos.
- Credenciales válidas para psicología/consejería.
- Política de emergencia y mensajes de crisis.
- Cancelación, reembolso y disputas.

Ningún pago o agenda pasa a producción sin resolver estos puntos y realizar una
auditoría específica.

