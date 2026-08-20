const test = require('node:test');
const assert = require('node:assert/strict');
const { lessonInputValidationError } = require('../src/validation/lesson');

function validLesson() {
  return {
    resourceId: 11,
    title: 'Seguridad emocional',
    content: 'Descripción suficientemente extensa.',
    position: 1,
    estimatedMinutes: 20,
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    pdfUrl: 'https://drive.google.com/file/d/abcdefghijk/view',
    slidesUrl: '',
    questions: Array.from({ length: 6 }, (_, index) => ({
      text: `Pregunta número ${index + 1}`,
      options: ['Primera', 'Segunda', 'Tercera', 'Cuarta'],
      correctOption: 1
    }))
  };
}

test('acepta una lección completa', () => {
  assert.equal(lessonInputValidationError(validLesson()), '');
});

test('identifica enlaces inválidos por tipo de recurso', () => {
  assert.match(lessonInputValidationError({ ...validLesson(), videoUrl: 'https://example.com/video' }), /YouTube/);
  assert.match(lessonInputValidationError({ ...validLesson(), pdfUrl: 'https://docs.google.com/document/d/abc' }), /PDF.*Google Drive/);
  assert.match(lessonInputValidationError({ ...validLesson(), slidesUrl: 'http://drive.google.com/file/d/abc' }), /diapositivas.*Google Drive/i);
});

test('identifica la pregunta y opción incompletas', () => {
  const shortQuestion = validLesson();
  shortQuestion.questions[3].text = 'No';
  assert.match(lessonInputValidationError(shortQuestion), /pregunta 4.*cinco caracteres/i);

  const emptyOption = validLesson();
  emptyOption.questions[1].options[2] = ' ';
  assert.match(lessonInputValidationError(emptyOption), /opción 3.*pregunta 2/i);
});

test('identifica la pregunta sin respuesta correcta', () => {
  const lesson = validLesson();
  lesson.questions[5].correctOption = 0;
  assert.match(lessonInputValidationError(lesson), /opción correcta.*pregunta 6/i);
});
