const test = require('node:test');
const assert = require('node:assert/strict');
const { supportPayload, progressPercentage } = require('../src/validation/tracking');

test('calcula el progreso académico desde las lecciones', () => {
  assert.equal(progressPercentage(3, 4), 75);
  assert.equal(progressPercentage(0, 0), 0);
});

test('normaliza el seguimiento por matrícula', () => {
  assert.deepEqual(supportPayload({
    supervisionCompleted: true,
    supervisionNotes: '  Revisión semanal  ',
    practiceCompleted: false,
    personalWorkCompleted: true
  }), {
    supervisionCompleted: true,
    supervisionNotes: 'Revisión semanal',
    practiceCompleted: false,
    practiceNotes: '',
    personalWorkCompleted: true,
    personalWorkNotes: ''
  });
});

test('rechaza observaciones excesivas y no acepta valores truthy como checks', () => {
  assert.equal(supportPayload({ supervisionNotes: 'a'.repeat(5001) }), null);
  assert.equal(supportPayload({ supervisionCompleted: 'true' }).supervisionCompleted, false);
});

test('acepta temporalmente los nombres anteriores durante la transición P7', () => {
  assert.deepEqual(supportPayload({ therapyAttendance: true, therapyNotes: ' Histórico ' }), {
    supervisionCompleted: false,
    supervisionNotes: '',
    practiceCompleted: false,
    practiceNotes: '',
    personalWorkCompleted: true,
    personalWorkNotes: 'Histórico'
  });
});
