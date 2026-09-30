const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { supportStatusForStudent } = require('../src/services/student-support');

test('proyecta exclusivamente los tres estados visibles para el estudiante', () => {
  const status = supportStatusForStudent({
    supervisionCompleted: 1,
    practiceCompleted: 0,
    personalWorkCompleted: true,
    supervisionNotes: 'dato interno',
    updatedBy: 7
  });
  assert.deepEqual(status, { supervision: true, practice: false, personalWork: true });
  assert.deepEqual(Object.keys(status), ['supervision', 'practice', 'personalWork']);
});

test('no interpreta cadenas truthy como requisitos aprobados', () => {
  assert.deepEqual(supportStatusForStudent({
    supervisionCompleted: '1',
    practiceCompleted: null,
    personalWorkCompleted: undefined
  }), { supervision: false, practice: false, personalWork: false });
});

test('la vista estudiantil presenta la certificación agrupada por módulo', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public', 'estudiante.js'), 'utf8');
  const builder = source.slice(source.indexOf('function buildModuleRequirements'), source.indexOf('function setupNavigation'));
  assert.match(builder, /Certificación por módulos/);
  assert.match(builder, /Trabajo personal/);
  assert.match(source, /Pendiente de respuesta/);
  assert.match(source, /En revisión/);
  assert.match(source, /Requiere correcciones/);
  assert.doesNotMatch(builder, /createElement\('input'\)|createElement\('textarea'\)|contenteditable/);
});

test('el listado de cursos del estudiante ya no proyecta requisitos generales de matrícula', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src', 'routes', 'learning.js'), 'utf8');
  const endpoint = source.slice(source.indexOf("router.get('/enrollments/my'"), source.indexOf('async function courseForManagement'));
  assert.doesNotMatch(endpoint, /supportStatusForStudent|enrollment_support_tracking|requirements/);
  assert.doesNotMatch(endpoint, /supervision_notes|practice_notes|personal_work_notes|updated_by/);
});
