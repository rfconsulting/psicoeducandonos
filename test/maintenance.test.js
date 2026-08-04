const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createMaintenanceMiddleware } = require('../src/middleware/maintenance');

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(file) { this.file = file; return this; }
  };
}

const middleware = createMaintenanceMiddleware({ enabled: true, publicDirectory: path.join(__dirname, '..', 'public') });

test('mantenimiento responde HTML 503 y evita cache', () => {
  const res = response();
  middleware({ path: '/', method: 'GET', session: {} }, res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Retry-After'], '3600');
  assert.equal(path.basename(res.file), 'mantenimiento.html');
});

test('mantenimiento responde JSON genérico para la API', () => {
  const res = response();
  middleware({ path: '/api/content/courses', method: 'GET', session: {} }, res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Servicio temporalmente en mantenimiento.' });
});

test('salud, recursos necesarios y superusuario conservan acceso', () => {
  for (const req of [
    { path: '/api/health', method: 'GET', session: {} },
    { path: '/auth.css', method: 'GET', session: {} },
    { path: '/dashboard.html', method: 'GET', session: { user: { role: 'superuser' } } }
  ]) {
    let continued = false;
    middleware(req, response(), () => { continued = true; });
    assert.equal(continued, true);
  }
});
