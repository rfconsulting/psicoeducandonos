# Fase 7 — Scheduling Core

## Alcance implementado

- Perfiles profesionales independientes de los roles de autenticación.
- Servicios de psicología y consejería con duración propia.
- Disponibilidad recurrente, excepciones y zona horaria IANA por profesional.
- Generación de slots en hora local y almacenamiento UTC.
- Holds exclusivos de diez minutos con liberación idempotente.
- Detección transaccional de solapamientos, no solo de horas de inicio iguales.
- Modelo de citas y eventos preparado para confirmación, reprogramación y cancelación.
- Productos preparados para vincular servicios sin relaciones polimórficas.
- Catálogo estudiantil mínimo para elegir servicio, fecha y horario.
- Historia clínica, diagnósticos y notas terapéuticas permanecen explícitamente fuera del alcance.

## Frontera de fase

Crear un hold no confirma una cita. La siguiente fase conectará `hold -> order -> webhook aprobado -> appointment confirmed`. Hasta entonces la interfaz informa que el bloqueo es temporal y no simula una reserva definitiva.

## Operación

Ejecutar periódicamente:

```bash
npm run scheduling:expire-holds
```

Gate:

```bash
npm test
npm run lint
npm audit --audit-level=high
npm run check:secrets
npm run db:verify
```
