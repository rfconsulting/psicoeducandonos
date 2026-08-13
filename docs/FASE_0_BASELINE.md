# Fase 0: baseline de ingeniería

## Alcance

Esta fase estabiliza la entrega existente antes de modificar el flujo operativo.
No incluye registro público, perfiles estudiantiles, comercio ni agenda.

## Baseline verificado

- Runtime soportado: Node.js 20 o superior.
- Base de datos: MySQL 8 / MariaDB compatible.
- Suite automatizada: 73 pruebas.
- Validación JavaScript: `npm run lint` y `npm run check`.
- Dependencias: `npm audit --omit=dev --audit-level=high`.
- Secretos: `npm run check:secrets`.
- Esquema y migraciones: `npm run db:verify` contra una base aislada.

## Quality gate de cambios

Un cambio está listo para integrarse cuando:

1. `npm ci` reproduce el árbol definido por `package-lock.json`.
2. `npm run lint` y `npm run check` terminan correctamente.
3. Las 73 pruebas pasan sin omisiones.
4. El esquema se inicializa y todas las migraciones se ejecutan dos veces sin
   errores, demostrando repetibilidad.
5. No quedan vulnerabilidades HIGH o CRITICAL sin una excepción documentada.
6. El escaneo de secretos no encuentra patrones prohibidos.

GitHub Actions ejecuta este gate con un servicio MySQL 8.4 efímero.

## Dependencia de seguridad

`express-rate-limit` permite versiones compatibles de `ip-address`, pero una
resolución anterior incorporaba vulnerabilidades HIGH relacionadas con la
clasificación de direcciones IP. El proyecto fija `ip-address` en la rama
segura `^10.5.0` mediante `overrides`; el lockfile es la fuente reproducible.

Al actualizar dependencias se debe ejecutar nuevamente el gate completo y
comprobar que `npm ls ip-address` no resuelva una versión inferior a 10.5.0.

## Estrategia de datos y rollback

- Antes de migrar producción se crea un respaldo verificable de la base.
- `database/schema.sql` es la fuente para instalaciones nuevas.
- `scripts/migrate-p0.js` a `scripts/migrate-p7.js` conservan compatibilidad con
  instalaciones existentes y deben permanecer reejecutables.
- Las migraciones se aplican en orden mediante `npm run db:migrate`.
- `npm run db:verify` solo debe apuntar a una base vacía o desechable de CI; no
  es un comando de rollback de producción.
- Si una migración productiva falla, se detiene el despliegue, no se inicia la
  nueva versión y se restaura el respaldo. No se intentan reversiones destructivas
  improvisadas sobre datos reales.

## Evidencia requerida para despliegue

- Commit o artefacto exacto.
- Resultado del workflow CI.
- Resultado del respaldo previo.
- Registro de migraciones aplicadas.
- Verificación de `/api/health`, landing, login y rutas protegidas.
- Responsable y ventana de observación posterior al despliegue.

## Riesgos residuales

- La suite aún no contiene pruebas HTTP end-to-end completas contra MySQL; el
  gate actual valida creación y repetibilidad del esquema.
- El secret scan es una defensa local por patrones y no sustituye protección de
  secretos del proveedor Git ni rotación ante una filtración.
- La compatibilidad con MariaDB debe comprobarse en el entorno de hosting antes
  de adoptar características exclusivas de MySQL.
