const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('los paneles de profesor y estudiante incluyen identidad en el menú', () => {
  for (const page of ['dashboard.html', 'estudiante.html']) {
    const html = fs.readFileSync(path.join(root, 'public', page), 'utf8');
    assert.match(html, /class="dashboard-profile"/);
    assert.match(html, /class="dashboard-avatar"/);
  }
});

test('el resumen estudiantil usa datos recibidos y no estadísticas ficticias', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'estudiante.js'), 'utf8');
  assert.match(source, /renderStudentSummary\(enrolledCourses,availableCourses,articles\)/);
  assert.match(source, /Object\.values\(course\.requirements\|\|\{\}\)/);
  assert.doesNotMatch(source, /Math\.random|mock|dummy/i);
});

test('el resumen del profesor se limita a sus cursos y artículos', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'dashboard.js'), 'utf8');
  assert.match(source, /currentUser\.role!=='teacher'/);
  assert.match(source, /course\.creatorId.*currentUser\.id/);
  assert.match(source, /article\.authorId.*currentUser\.id/);
});

test('el menú conserva contraste después de las reglas del tema base', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'auth.css'), 'utf8');
  const baseOverride = css.lastIndexOf('.dashboard-sidebar{background:var(--cream)}');
  const workspaceOverride = css.indexOf('.dashboard:has(.dashboard-shell) .dashboard-sidebar{background:linear-gradient', baseOverride);
  assert.ok(workspaceOverride > baseOverride);
  assert.match(css.slice(workspaceOverride), /\.nav-item\{color:#e6f0ee\}/);
  assert.match(css.slice(workspaceOverride), /\.nav-item\.active\{background:var\(--cream\);color:var\(--deep\)\}/);
});
