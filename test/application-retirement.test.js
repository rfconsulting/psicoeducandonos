const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');

test('la web pública no ofrece enlaces al formulario legado', () => {
  for (const file of ['index.html', 'diplomado.html', 'registro.html', 'sitemap.xml']) {
    const source = fs.readFileSync(path.join(publicRoot, file), 'utf8');
    assert.doesNotMatch(source, /postulacion\.html|postularme/i);
  }
  assert.equal(fs.existsSync(path.join(publicRoot, 'postulacion.html')), false);
});

test('el panel no muestra la cola antigua y conserva la revisión de perfiles', () => {
  const html = fs.readFileSync(path.join(publicRoot, 'dashboard.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicRoot, 'dashboard.js'), 'utf8');
  assert.doesNotMatch(html, /applications-nav|applications-section|>Postulaciones</i);
  assert.doesNotMatch(script, /loadApplications|applicationsCursor/);
  assert.match(html, /profile-reviews-nav/);
  assert.match(script, /loadProfileReviews/);
});

test('el servidor rechaza nuevas solicitudes del endpoint legado', () => {
  const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
  assert.match(server, /app\.post\('\/api\/applications'.*status\(404\)/);
});
