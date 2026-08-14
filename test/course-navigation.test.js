const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'curso.js'), 'utf8');

test('el aula renderiza una sola lección seleccionada', () => {
  assert.match(source, /selectedLessonId/);
  assert.match(source, /function renderSelectedLesson\(\)/);
  assert.match(source, /workspace\.textContent = ''/);
  assert.match(source, /aria-current', 'step'/);
});

test('el árbol diferencia lecciones terminadas y pendientes', () => {
  assert.match(source, /lesson\.completed \? '✓ Terminada' : lesson\.locked/);
  assert.match(source, /outline-lesson.*completed/);
  assert.match(source, /module\.lessons\.filter\(lesson => lesson\.completed\)/);
});

test('la navegación ofrece anterior, siguiente y enlace directo por hash', () => {
  assert.match(source, /Lección anterior/);
  assert.match(source, /Siguiente lección/);
  assert.match(source, /#leccion-\$\{lesson\.id\}/);
});

test('la navegación no abre ni avanza hacia lecciones bloqueadas', () => {
  assert.match(source, /!lesson \|\| lesson\.locked/);
  assert.match(source, /button\.disabled = lesson\.locked/);
  assert.match(source, /lessonSequence\[index \+ 1\]\?\.locked/);
  assert.match(source, /hashId && !lesson\.locked/);
});
