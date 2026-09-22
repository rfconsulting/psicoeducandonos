const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pool = require('../src/config/database');
const withTransaction = require('../src/services/transaction');

const authSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8');

test('login y MFA bloquean la fila antes de decidir y actualizan sus contadores dentro de la transacción', () => {
  assert.match(authSource, /FROM users WHERE email = \? LIMIT 1 FOR UPDATE/);
  assert.match(authSource, /mfa_failed_attempts,mfa_locked_until FROM users WHERE id=\? LIMIT 1 FOR UPDATE/);
  assert.match(authSource, /audit\(req, 'login_failed'.*db: connection, required: true/);
  assert.match(authSource, /audit\(req, 'mfa_challenge_limited'.*db: connection, required: true/);
});

test('cinco fallos concurrentes bloquean de forma persistente login y MFA', async (t) => {
  const email = `concurrency-${process.pid}-${Date.now()}@example.test`;
  let userId;
  try {
    const [created] = await pool.execute(
      `INSERT INTO users (full_name,email,password_hash,role,status,email_verified_at)
       VALUES (?,?,?,'administrator','active',UTC_TIMESTAMP())`,
      ['Concurrency Test', email, '$2b$12$2b2kYf7n1Thf0Wwq3QxWQO0BRYxRPRYSrxrYrpy0V9HDq4ZgFQYje']
    );
    userId = created.insertId;
  } catch (error) {
    if (['ECONNREFUSED', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
      t.skip(`MySQL de prueba no disponible o sin P24: ${error.code}`);
      return;
    }
    throw error;
  }

  t.after(async () => {
    await pool.execute('DELETE FROM users WHERE id=?', [userId]);
    await pool.end();
  });

  const fail = () => withTransaction(async connection => {
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    await connection.execute(
      `UPDATE users SET
       mfa_locked_until=IF(mfa_failed_attempts + 1 >= 5,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),NULL),
       mfa_failed_attempts=IF(mfa_failed_attempts + 1 >= 5,0,mfa_failed_attempts + 1)
       WHERE id=?`, [userId]
    );
  });

  await Promise.all(Array.from({ length: 5 }, fail));
  const [[state]] = await pool.execute('SELECT mfa_failed_attempts,mfa_locked_until FROM users WHERE id=?', [userId]);
  assert.equal(state.mfa_failed_attempts, 0);
  assert.ok(state.mfa_locked_until instanceof Date);
  assert.ok(state.mfa_locked_until.getTime() > Date.now());

  const failLogin = () => withTransaction(async connection => {
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    await connection.execute(
      `UPDATE users SET
       locked_until=IF(failed_login_attempts + 1 >= 5,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),NULL),
       failed_login_attempts=IF(failed_login_attempts + 1 >= 5,0,failed_login_attempts + 1)
       WHERE id=?`, [userId]
    );
  });

  await Promise.all(Array.from({ length: 5 }, failLogin));
  const [[loginState]] = await pool.execute('SELECT failed_login_attempts,locked_until FROM users WHERE id=?', [userId]);
  assert.equal(loginState.failed_login_attempts, 0);
  assert.ok(loginState.locked_until instanceof Date);
  assert.ok(loginState.locked_until.getTime() > Date.now());
});
