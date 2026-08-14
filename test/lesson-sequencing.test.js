const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sequenceLessons } = require('../src/services/lesson-sequencing');

const modules = [
  { id: 1, lessons: [{ id: 10 }, { id: 11 }] },
  { id: 2, lessons: [{ id: 20 }, { id: 21 }] }
];

test('solo desbloquea la primera lección pendiente entre módulos', () => {
  const result = sequenceLessons(modules, new Set([10]), true).flatMap(module => module.lessons);
  assert.deepEqual(result.map(lesson => [lesson.id, lesson.completed, lesson.locked]), [
    [10, true, false], [11, false, false], [20, false, true], [21, false, true]
  ]);
});

test('una lección completada con hueco sigue disponible para repaso sin abrir posteriores', () => {
  const result = sequenceLessons(modules, new Set([10, 20]), true).flatMap(module => module.lessons);
  assert.equal(result.find(lesson => lesson.id === 20).locked, false);
  assert.equal(result.find(lesson => lesson.id === 21).locked, true);
});

test('gestores conservan acceso completo al editar el curso', () => {
  assert.equal(sequenceLessons(modules, new Set(), false).flatMap(module => module.lessons).every(lesson => !lesson.locked), true);
});

test('el servidor oculta recursos futuros y revalida prerrequisitos bajo bloqueo', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/learning.js'), 'utf8');
  assert.match(source, /lesson\.content = ''/);
  assert.match(source, /lesson\.questions = \[\]/);
  assert.match(source, /course_enrollments WHERE id=\? FOR UPDATE/);
  assert.match(source, /LESSON_PREREQUISITE_REQUIRED/);
});
