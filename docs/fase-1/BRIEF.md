# Brief: evolución operativa de Psicoeducándonos

## Problema

Actualmente una persona completa una postulación pública y administración crea
o vincula su cuenta al aprobarla. Esto mezcla admisión, identidad y matrícula,
impide que el usuario gestione progresivamente su información y no ofrece una
base adecuada para cursos gratuitos/pagos ni consultas con agenda.

## Resultado esperado

Una persona crea y verifica su cuenta, completa un perfil progresivo, lo envía
a revisión y accede a recursos según políticas explícitas. Cursos y consultas
comparten Commerce, pero conservan sus reglas académicas y de agenda.

## Actores

- Visitante o cliente: crea cuenta y puede solicitar servicios permitidos.
- Estudiante: mantiene un perfil y consume matrículas activas.
- Profesional: publica disponibilidad y atiende servicios autorizados.
- Profesor: administra sus cursos y estudiantes dentro de su alcance.
- Administrador: revisa perfiles y opera catálogo, matrículas y agenda.
- Superusuario: administra privilegios, auditoría y excepciones críticas.
- Proveedor de correo, pago y videollamada: sistemas externos no confiables por
  defecto; sus respuestas se verifican.

## Objetivos medibles

- Registro a correo verificado: tasa y tiempo medibles.
- Perfil iniciado a enviado: tasa de finalización medible.
- Perfil enviado a decisión: mediana y percentil 90 medibles.
- Cero matrícula o cita concedida por una redirección del navegador.
- Cero efectos duplicados ante reintentos de inscripción o webhook.
- Cero doble reserva confirmada para un profesional y franja incompatibles.

Las metas numéricas se fijarán tras obtener cuatro semanas de baseline; no se
inventan valores sin evidencia operativa.

## Incluido

- Registro y verificación de correo.
- Perfil estudiantil progresivo y revisión con historial.
- Catálogo con cursos gratuitos y pagos.
- Commerce común, matrículas y agenda de consultas.
- Auditoría, notificaciones, retención y observabilidad asociadas.

## Fuera de alcance

- Expediente o historia clínica.
- Diagnóstico, prescripción o tratamiento automatizado.
- Marketplace abierto de profesionales.
- Custodia directa de datos de tarjeta o claves de criptomonedas.
- Migración destructiva o eliminación inmediata de `applications`.

## Restricciones

- Node.js 20+, Express 5 y MySQL/MariaDB.
- Frontend same-origin y sesión mediante cookie.
- SQL parametrizado, CSRF en mutaciones y MFA para roles privilegiados.
- Fechas persistidas en UTC; zona horaria explícita en agenda.
- Datos personales mínimos y retención definida antes de producción.
- Todo acceso se autoriza en servidor por capacidad, recurso y estado de negocio.

## Preguntas con dueño humano

- Proveedor, países, monedas e impuestos: negocio/finanzas, antes de Commerce.
- Cancelación, no-show y reembolso: negocio/legal, antes de consultas pagas.
- Credenciales admitidas para profesionales: dirección clínica/legal.
- Videollamada y datos compartidos: privacidad/operaciones.
- Cursos abiertos frente a cursos con aprobación: responsable académico.

