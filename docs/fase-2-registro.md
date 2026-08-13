# Fase 2: registro y verificación de correo

## Flujo implementado

```text
POST /api/auth/register
  -> validar nombre, correo y contraseña
  -> crear cuenta student activa y no verificada
  -> invalidar tokens anteriores y crear token SHA-256 con vigencia de 24 h
  -> enviar correo
  -> responder 202 sin revelar duplicados

POST /api/auth/verify-email
  -> bloquear token válido
  -> marcar correo verificado
  -> consumir todos los tokens pendientes del usuario

POST /api/auth/verification/resend
  -> respuesta 202 uniforme
  -> solo una cuenta activa no verificada recibe un token nuevo
```

## Seguridad

- CSRF en las tres mutaciones.
- Límite de cinco solicitudes por IP cada 15 minutos para registro y reenvío.
- Contraseña bcrypt con coste 12.
- Token aleatorio de 32 bytes; MySQL conserva únicamente SHA-256.
- Token de un uso, 24 horas de vigencia e invalidación al renovar.
- Respuestas y demora mínima reducen enumeración de cuentas.
- Auditoría de creación, duplicado ignorado, entrega, fallo y verificación.
- El login existente continúa bloqueando correos no verificados.

## Compatibilidad y datos

P8 añade `users.registration_source` con valores `admin`, `application`,
`public` y `legacy`. Los registros existentes reciben `legacy`; no se modifica ni
elimina `applications`. La postulación permanece disponible durante la transición.

La migración es aditiva y reejecutable. Antes de producción se requiere respaldo;
si falla, se conserva la versión anterior y se restaura el respaldo antes de
reiniciar el servicio.

## Verificación operativa

1. Ejecutar `npm run migrate:p8` o el flujo completo `npm run db:migrate`.
2. Confirmar que `/registro.html` responde 200.
3. Registrar una cuenta de prueba y comprobar entrega por Resend.
4. Confirmar que login falla antes de verificar.
5. Consumir el enlace y confirmar que no puede reutilizarse.
6. Confirmar login y redirección al dashboard estudiantil.
7. Probar reenvío para cuenta inexistente, verificada y pendiente sin observar
   diferencias de cuerpo o código HTTP.
