const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'dashboard.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'dashboard.js'), 'utf8');

test('el ID del módulo permanece visible, se envía y no puede editarse', () => {
  assert.match(html, /id="lesson-module-id"[^>]*name="moduleId"[^>]*readonly[^>]*required/);
  assert.doesNotMatch(html, /id="lesson-module-id"[^>]*disabled/);
});

test('cada módulo permite iniciar una lección con su ID asignado', () => {
  assert.match(script, /function startLessonCreation\(module\)/);
  assert.match(script, /form\.elements\.moduleId\.value=module\.id/);
  assert.match(script, /addLesson\.textContent='Añadir lección'/);
});
