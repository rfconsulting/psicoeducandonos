const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const modalSource = fs.readFileSync(path.join(root, 'public', 'notification-modal.js'), 'utf8');

test('el modal reutilizable evita insertar contenido dinámico como HTML', () => {
  assert.doesNotMatch(modalSource, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(modalSource, /heading\.textContent = title/);
  assert.match(modalSource, /description\.textContent = message/);
});

test('el modal ofrece cierre accesible y devuelve el foco', () => {
  assert.match(modalSource, /dialog\.addEventListener\('cancel'/);
  assert.match(modalSource, /previousFocus\.focus\(\)/);
  assert.match(modalSource, /closeButton\.focus\(\)/);
  assert.match(modalSource, /aria-labelledby/);
  assert.match(modalSource, /aria-describedby/);
});

test('postulación y curso cargan el componente antes de su script de página', () => {
  for (const page of ['postulacion.html', 'curso.html']) {
    const html = fs.readFileSync(path.join(root, 'public', page), 'utf8');
    assert.ok(html.indexOf('notification-modal.js') < html.indexOf(page.replace('.html', '.js')));
  }
});

test('una postulación aceptada muestra la confirmación con estado de éxito', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'postulacion.js'), 'utf8');
  assert.match(source, /NotificationModal\.show\(\{type:'success'/);
  assert.match(source, /Usted se ha postulado exitosamente\./);
  assert.ok(source.indexOf('if(!response.ok)') < source.indexOf('NotificationModal.show'));
});

test('una lección se confirma solo después de guardar su progreso', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'curso.js'), 'utf8');
  assert.match(source, /NotificationModal\.show\(\{\s*type:\s*'success',\s*title:\s*'¡Lección completada!'/);
  assert.match(source, /Tu progreso ha sido guardado correctamente\./);
  assert.match(source, /method:\s*'PATCH'/);
  assert.ok(source.indexOf("method: 'PATCH'") < source.indexOf('NotificationModal.show'));
  assert.match(source, /lesson\.completed\s*=\s*true/);
  assert.ok(source.indexOf('lesson.completed = true') < source.indexOf('NotificationModal.show'));
});
