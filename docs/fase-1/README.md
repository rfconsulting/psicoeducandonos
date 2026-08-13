# Fase 1: contratos de dominio y decisiones

## Objetivo

Preparar la evolución desde postulación previa a cuenta hacia el flujo
`registro -> verificación -> perfil -> revisión -> catálogo`, conservando el
histórico y sin acoplar formación, consultas y pagos.

## Entregables

- [Brief](BRIEF.md)
- [Contratos de dominio](DOMINIO.md)
- [Autorización](AUTORIZACION.md)
- [Modelo de amenazas](SEGURIDAD.md)
- [Registro de decisiones](adr/README.md)

## Alcance aprobado para las siguientes iteraciones

1. Mantener el monolito modular Express/MySQL.
2. Separar cuenta, perfil estudiantil, matrícula, orden, pago y cita.
3. Permitir login a una cuenta activa y verificada aunque su perfil esté
   pendiente.
4. Exigir aprobación solo en recursos cuya política así lo indique.
5. Conservar `applications` como histórico legado durante la transición.
6. Usar Commerce como infraestructura compartida por cursos y consultas.

## Fuera de alcance de esta fase

- Migraciones o endpoints nuevos.
- Pantallas de registro, perfil, catálogo, checkout o agenda.
- Selección definitiva de proveedor de pagos.
- Historia clínica, diagnóstico o notas terapéuticas.

## Quality gate

La arquitectura está lista para iniciar registro y onboarding. Commerce no está
listo para implementación hasta resolver ADR-007. Cada iteración posterior debe
definir criterios de aceptación, migración reejecutable, pruebas negativas y
rollback antes de editar código.

