const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROFESSIONAL_TYPES, SERVICE_TYPES, validProfessionalType, validServiceType, professionalCanOffer, validTimezone, minutes, slotsForDay, zonedDateTimeToUtc, localDateTime } = require('../src/services/scheduling');

test('clasifica psicología, psiquiatría y consejería como tipos profesionales separados del rol', () => {
  assert.deepEqual(PROFESSIONAL_TYPES, ['psychologist', 'psychiatrist', 'counselor']);
  assert.deepEqual(SERVICE_TYPES, ['psychology', 'psychiatry', 'counseling']);
  assert.equal(validProfessionalType('psychiatrist'), true);
  assert.equal(validServiceType('psychiatry'), true);
  assert.equal(professionalCanOffer('psychiatrist', 'psychiatry'), true);
  assert.equal(professionalCanOffer('psychiatrist', 'psychology'), false);
});

test('la migración amplía ambos enums sin crear un rol de autorización', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../scripts/migrate-p20.js'), 'utf8');
  const access = fs.readFileSync(path.join(__dirname, '../src/constants/access.js'), 'utf8');
  assert.match(migration, /professional_type ENUM\('psychologist','psychiatrist','counselor'\)/);
  assert.match(migration, /service_type ENUM\('psychology','psychiatry','counseling'\)/);
  assert.doesNotMatch(access, /PSYCHIATRIST/);
});

test('el dashboard exige validar credenciales antes de publicar agenda', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/scheduling.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../scripts/migrate-p21.js'), 'utf8');
  assert.match(route, /credential_status='verified'/);
  assert.match(route, /professional_credentials_/);
  assert.match(route, /professional_profile_submitted/);
  assert.match(dashboard, /setupProfessionalManagement/);
  assert.match(dashboard, /Crear servicio y precio/);
  assert.match(dashboard, /Agregar disponibilidad semanal/);
  assert.match(migration, /credential_status ENUM\('pending','verified','rejected'\)/);
});

test('valida zona horaria y rangos de minutos', () => {
  assert.equal(validTimezone('America/Panama'), true);
  assert.equal(validTimezone('Planeta/Inexistente'), false);
  assert.equal(minutes('14:30'), 870);
  assert.equal(minutes('25:00'), null);
});

test('genera slots completos sin exceder disponibilidad', () => {
  assert.deepEqual(slotsForDay({ date: '2026-08-17', weekday: 'mon', startTime: '09:00', endTime: '11:00', durationMinutes: 50 }), ['09:00', '09:50']);
  assert.deepEqual(slotsForDay({ date: '2026-08-17', weekday: 'tue', startTime: '09:00', endTime: '11:00', durationMinutes: 50 }), []);
});

test('convierte horario local a UTC conservando la hora de agenda', () => {
  const instant = zonedDateTimeToUtc('2026-08-17', '14:00', 'America/Panama');
  assert.equal(instant.toISOString(), '2026-08-17T19:00:00.000Z');
  assert.deepEqual(localDateTime(instant, 'America/Panama'), { date: '2026-08-17', time: '14:00', weekday: 'mon' });
});

test('el hold serializa por profesional, detecta solapamientos y expira', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/scheduling.js'), 'utf8');
  assert.match(source, /p\.status='active'.*FOR UPDATE/s);
  assert.match(source, /start_at<\? AND end_at>\?/);
  assert.match(source, /expires_at>UTC_TIMESTAMP/);
  assert.match(source, /DELETE FROM appointment_holds WHERE professional_id=\? AND expires_at<=UTC_TIMESTAMP/);
});

test('la agenda no incorpora historia clínica ni notas terapéuticas', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../scripts/migrate-p13.js'), 'utf8');
  assert.doesNotMatch(migration, /diagnosis|diagnóstico|therapy_notes|clinical_notes/i);
});
