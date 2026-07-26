const test = require('node:test');
const assert = require('node:assert/strict');
const {
  youtubeUrl,
  driveUrl,
  youtubeEmbedUrl,
  normalizeQuestions,
  evaluateAnswers,
  questionForClient
} = require('../src/validation/lesson');

function questions() {
  return Array.from({ length: 6 }, (_, index) => ({
    text: `Pregunta clave número ${index + 1}`,
    options: ['Primera', 'Segunda', 'Tercera', 'Cuarta'],
    correctOption: (index % 4) + 1
  }));
}

test('acepta exclusivamente enlaces HTTPS de YouTube y Google Drive', () => {
  assert.equal(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.ok(youtubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(driveUrl('https://drive.google.com/file/d/archivo/view'));
  assert.equal(youtubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), '');
  assert.equal(driveUrl('javascript:alert(1)'), '');
});

test('exige exactamente seis preguntas, cuatro opciones y una correcta', () => {
  assert.equal(normalizeQuestions(questions()).length, 6);
  assert.equal(normalizeQuestions(questions().slice(0, 5)), null);
  const invalid = questions(); invalid[0].correctOption = 5;
  assert.equal(normalizeQuestions(invalid), null);
});

test('solo completa cuando las seis respuestas son correctas', () => {
  const correct = Array.from({ length: 6 }, (_, index) => ({ questionId: index + 1, optionId: index + 11, position: index + 1 }));
  const answers = correct.map(item => ({ questionId: item.questionId, optionId: item.optionId }));
  assert.deepEqual(evaluateAnswers(correct, answers), []);
  answers[2].optionId = 999;
  assert.deepEqual(evaluateAnswers(correct, answers), [3]);
  assert.equal(evaluateAnswers(correct, answers.slice(0, 5)), null);
});

test('solo entrega la opción correcta durante la gestión del curso', () => {
  const question = { id: 10, lessonId: 3, text: 'Pregunta', position: 1 };
  const options = [
    { id: 1, questionId: 10, text: 'A', position: 1, isCorrect: 0 },
    { id: 2, questionId: 10, text: 'B', position: 2, isCorrect: 1 }
  ];
  const studentView = questionForClient(question, options, false);
  const managementView = questionForClient(question, options, true);
  assert.equal(Object.hasOwn(studentView, 'correctOption'), false);
  assert.equal(studentView.options.some(option => Object.hasOwn(option, 'isCorrect')), false);
  assert.equal(managementView.correctOption, 2);
});
