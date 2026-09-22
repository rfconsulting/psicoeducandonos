const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const pool = require('../src/config/database');
const scheduling = require('../src/routes/scheduling');

test('una cuenta estudiantil activa puede consultar servicios sin aprobación académica', async () => {
  const originalExecute = pool.execute;
  const queries = [];
  pool.execute = async (sql) => {
    queries.push(sql);
    if (sql.includes('FROM users WHERE id = ?')) return [[{
      id: 1, full_name: 'Cliente', email: 'cliente@example.test', role: 'student',
      status: 'active', auth_version: 1, must_change_password: false, mfa_enabled: false
    }]];
    if (sql.includes('FROM professional_services s')) return [[]];
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  const app = express();
  app.use((req, _res, next) => {
    req.session = { user: { id: 1, role: 'student', authVersion: 1 } };
    next();
  });
  app.use('/api/scheduling', scheduling);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/scheduling/services`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { services: [] });
    assert.equal(queries.some(sql => sql.includes('student_profiles')), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.execute = originalExecute;
  }
});
