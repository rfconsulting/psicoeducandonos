const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { questionPayload, answerPayload, reviewPayload } = require('../src/services/module-certification');

test('exige una pregunta válida para cada área del módulo', () => {
  assert.deepEqual(questionPayload({ questions: {
    supervision: '¿Qué aprendiste en supervisión?',
    practice: '¿Qué actividad práctica realizaste?',
    personal_work: '¿Qué trabajo personal realizaste?'
  } }), {
    supervision: '¿Qué aprendiste en supervisión?',
    practice: '¿Qué actividad práctica realizaste?',
    personal_work: '¿Qué trabajo personal realizaste?'
  });
  assert.equal(questionPayload({ questions: { supervision: 'Una pregunta' } }), null);
});

test('valida respuestas y revisiones sin aceptar checks truthy', () => {
  assert.deepEqual(answerPayload({ area: 'practice', answer: '  Realicé la práctica grupal.  ' }), { area: 'practice', answer: 'Realicé la práctica grupal.' });
  assert.equal(answerPayload({ area: 'other', answer: 'Respuesta' }), null);
  const review = reviewPayload({ areas: { supervision: { certified: 'true' }, practice: { certified: true }, personal_work: {} } });
  assert.equal(review.supervision.certified, false);
  assert.equal(review.practice.certified, true);
});

test('la certificación está asociada a módulo y conserva observaciones visibles', () => {
  const root = path.resolve(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src', 'routes', 'module-certification.js'), 'utf8');
  assert.match(schema, /PRIMARY KEY \(enrollment_id,module_id,area\)/);
  assert.match(route, /teacher_observation/);
  assert.match(route, /refreshEnrollmentCompletion/);
});
