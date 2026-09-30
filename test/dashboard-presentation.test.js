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
  assert.match(source, /course\.certifications\|\|\[\]/);
  assert.match(source, /Certificaciones aprobadas/);
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
  const compactCss = css.replace(/\s+/g, '');
  const baseOverride = compactCss.lastIndexOf('.dashboard-sidebar{background:var(--cream)}');
  const workspaceOverride = compactCss.indexOf('.dashboard:has(.dashboard-shell).dashboard-sidebar{background:linear-gradient', baseOverride);
  assert.ok(workspaceOverride > baseOverride);
  assert.match(compactCss.slice(workspaceOverride), /\.nav-item\{color:#e6f0ee\}/);
  assert.match(compactCss.slice(workspaceOverride), /\.nav-item\.active\{background:var\(--cream\);color:var\(--deep\)\}/);
});

test('el directorio presenta tres tarjetas profesionales verticales en escritorio', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'auth.css'), 'utf8').replace(/\s+/g, '');
  assert.match(css, /\.professional-directory\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.professional-directory\{[^}]*align-items:stretch/);
  assert.match(css, /\.professional-directory-card\{[^}]*flex-direction:column/);
  assert.match(css, /\.professional-directory-card\{[^}]*height:100%/);
  assert.match(css, /@media\(max-width:900px\)\{\.professional-directory\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)\{[^}]*\.professional-directory\{grid-template-columns:1fr/);
});

test('el workspace contiene el ancho en iPhone Pro Max y Android', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'auth.css'), 'utf8').replace(/\s+/g, '');
  assert.match(css, /@media\(max-width:600px\)\{html,body\.dashboard\{[^}]*overflow-x:hidden/);
  assert.match(css, /\.dashboard-shell,\.dashboard-sidebar,\.dashboardmain\.dashboard-content\{width:100%;max-width:100%;min-width:0\}/);
  assert.match(css, /\.dashboard-nav\{[^}]*max-width:100%[^}]*overflow-x:auto/);
  assert.match(css, /\.dashboardmain\.dashboard-content\{padding:24px16px40px;overflow:hidden\}/);
  assert.match(css, /@media\(max-width:380px\)/);
});

test('tablet y móvil usan un menú hamburguesa accesible', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'auth.css'), 'utf8').replace(/\s+/g, '');
  for (const page of ['dashboard.html', 'estudiante.html']) {
    const html = fs.readFileSync(path.join(root, 'public', page), 'utf8');
    assert.match(html, /id="dashboard-menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="dashboard-sidebar"/);
    assert.match(html, /id="dashboard-sidebar"/);
  }
  for (const script of ['dashboard.js', 'estudiante.js']) {
    const source = fs.readFileSync(path.join(root, 'public', script), 'utf8');
    assert.match(source, /function setupMobileMenu/);
    assert.match(source, /event\.key==='Escape'/);
  }
  assert.match(css, /@media\(max-width:800px\)\{\.dashboard-menu-toggle\{display:block/);
  assert.match(css, /\.dashboard-sidebar\.mobile-open\{display:block\}/);
});
