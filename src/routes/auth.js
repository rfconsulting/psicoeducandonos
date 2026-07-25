const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const pool = require('../config/database');
const { verifyCsrf, requireAuth } = require('../middleware/security');
const audit = require('../services/audit');
const deliverPasswordReset = require('../services/password-reset');
const { normalizeEmail, validPassword } = require('../validation/auth');
const withTransaction = require('../services/transaction');
const mfa = require('../services/mfa');
const securityAlert = require('../services/security-alert');
const { ROLES } = require('../constants/access');
const {
  resetMfaAttempts,
  mfaChallengeAvailable,
  recordMfaFailure
} = require('../services/mfa-attempts');
const {
  PASSWORD_RESET_EXPIRES_MINUTES,
  generateResetToken,
  hashResetToken,
  genericForgotPasswordResponse
} = require('../services/password-reset-token');

const router = express.Router();
const DUMMY_HASH = '$2b$12$2b2kYf7n1Thf0Wwq3QxWQO0BRYxRPRYSrxrYrpy0V9HDq4ZgFQYje';

router.post('/login', verifyCsrf, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, password_hash, role, status, auth_version, must_change_password, email_verified_at, mfa_enabled, failed_login_attempts, locked_until FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    const locked = user?.locked_until && new Date(user.locked_until) > new Date();

    if (!user || !passwordMatches || user.status !== 'active' || locked) {
      if (user && !locked) {
        await pool.execute(
          `UPDATE users SET
           locked_until = IF(failed_login_attempts + 1 >= 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), NULL),
           failed_login_attempts = IF(failed_login_attempts + 1 >= 5, 0, failed_login_attempts + 1)
           WHERE id = ?`,
          [user.id]
        );
      }
      await audit(req, 'login_failed', 'user', user?.id || null);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    if (!user.email_verified_at) return res.status(403).json({ error: 'Debes verificar tu correo antes de ingresar.', code: 'EMAIL_VERIFICATION_REQUIRED' });

    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.user = { id: user.id, fullName: user.full_name, email: user.email, role: user.role, authVersion: user.auth_version };
    const privileged = [ROLES.SUPERUSER, ROLES.ADMINISTRATOR].includes(user.role);
    req.session.mfaVerified = !privileged;
    req.session.csrfToken = require('../config/env').randomToken();
    await pool.execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    await audit(req, 'login_succeeded', 'user', user.id);
    const redirect = user.must_change_password ? '/cambiar-password.html' : (privileged ? '/mfa.html' : (user.role === 'student' ? '/estudiante.html' : '/dashboard.html'));
    res.json({ message: 'Sesión iniciada.', user: req.session.user, redirect });
  } catch (error) { next(error); }
});

router.post('/logout', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await audit(req, 'logout', 'user', userId);
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('psico.sid');
      res.json({ message: 'Sesión cerrada.' });
    });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.session.user }));

router.post('/mfa/setup', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    if (![ROLES.SUPERUSER, ROLES.ADMINISTRATOR].includes(req.authUser.role)) return res.status(403).json({ error: 'MFA no requerido para este rol.' });
    const [rows] = await pool.execute('SELECT email,mfa_enabled,mfa_secret_encrypted FROM users WHERE id=? LIMIT 1', [req.authUser.id]);
    if (rows[0].mfa_enabled) return res.json({ setupRequired: false });
    let secret;
    if (rows[0].mfa_secret_encrypted) secret = mfa.decrypt(rows[0].mfa_secret_encrypted);
    else {
      secret = mfa.generateSecret();
      await pool.execute('UPDATE users SET mfa_secret_encrypted=? WHERE id=?', [mfa.encrypt(secret), req.authUser.id]);
    }
    const label = encodeURIComponent(`Psicoeducandonos:${rows[0].email}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=Psicoeducandonos&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: { dark: '#173c36', light: '#ffffff' }
    });
    return res.json({ setupRequired: true, secret, qrDataUrl });
  } catch (error) { return next(error); }
});

router.post('/mfa/verify', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const genericError = 'No fue posible completar la verificación. Inicia sesión nuevamente e inténtalo más tarde.';
    if (!mfaChallengeAvailable(req.session, req.authUser.id)) {
      return res.status(429).json({ error: genericError });
    }
    const [rows] = await pool.execute('SELECT mfa_secret_encrypted FROM users WHERE id=? LIMIT 1', [req.authUser.id]);
    if (!rows[0]?.mfa_secret_encrypted || !mfa.verify(mfa.decrypt(rows[0].mfa_secret_encrypted), req.body.code)) {
      const attempt = recordMfaFailure(req.session, req.authUser.id);
      await securityAlert('mfa_failed', { userId: req.authUser.id, requestId: req.requestId });
      if (attempt.limited) {
        await audit(req, 'mfa_challenge_limited', 'user', req.authUser.id);
        return res.status(429).json({ error: genericError });
      }
      return res.status(401).json({ error: 'Código de verificación incorrecto.' });
    }
    resetMfaAttempts(req.session);
    await pool.execute('UPDATE users SET mfa_enabled=TRUE WHERE id=?', [req.authUser.id]);
    req.session.mfaVerified = true;
    await audit(req, 'mfa_verified', 'user', req.authUser.id);
    await securityAlert('privileged_login', { userId: req.authUser.id, role: req.authUser.role, requestId: req.requestId });
    return res.json({ message: 'Verificación completada.', redirect: '/dashboard.html' });
  } catch (error) { return next(error); }
});

router.post('/change-password', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!validPassword(newPassword)) return res.status(422).json({ error: 'La nueva contraseña no cumple la política de seguridad.' });
    if (currentPassword === newPassword) return res.status(422).json({ error: 'La nueva contraseña debe ser diferente.' });
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=? LIMIT 1', [req.session.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await withTransaction(async connection => {
      await connection.execute('UPDATE users SET password_hash=?, must_change_password=FALSE, password_changed_at=UTC_TIMESTAMP(), auth_version=auth_version+1 WHERE id=?', [hash, req.session.user.id]);
      await audit(req, 'password_changed', 'user', req.session.user.id, null, { db: connection, required: true });
    });
    req.session.destroy(() => {
      res.clearCookie('psico.sid');
      res.json({ message: 'Contraseña actualizada. Inicia sesión nuevamente.' });
    });
  } catch (error) { next(error); }
});

router.post('/forgot-password', verifyCsrf, async (req, res, next) => {
  const generic = genericForgotPasswordResponse();
  try {
    const email = normalizeEmail(req.body.email);
    const [rows] = await pool.execute("SELECT id,email FROM users WHERE email=? AND status='active' LIMIT 1", [email]);
    if (!rows[0]) return res.json(generic);
    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    await pool.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [rows[0].id]);
    await pool.execute('INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))', [rows[0].id, tokenHash]);
    try {
      const delivered = await deliverPasswordReset(rows[0].email, token, PASSWORD_RESET_EXPIRES_MINUTES);
      await audit(req, delivered ? 'password_reset_requested' : 'password_reset_delivery_unconfigured', 'user', rows[0].id);
    } catch (deliveryError) {
      await audit(req, 'password_reset_delivery_failed', 'user', rows[0].id);
      console.error('Falló la entrega de recuperación:', deliveryError.message);
    }
    return res.json(generic);
  } catch (error) { return next(error); }
});

router.post('/reset-password', verifyCsrf, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const tokenHash = hashResetToken(req.body.token || '');
    const newPassword = String(req.body.newPassword || '');
    if (!validPassword(newPassword)) return res.status(422).json({ error: 'La nueva contraseña no cumple la política de seguridad.' });
    await connection.beginTransaction();
    const [tokens] = await connection.execute(
      `SELECT t.id,t.user_id FROM password_reset_tokens t JOIN users u ON u.id=t.user_id
       WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>UTC_TIMESTAMP() AND u.status='active' FOR UPDATE`,
      [tokenHash]
    );
    if (!tokens[0]) {
      await connection.rollback();
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await connection.execute('UPDATE users SET password_hash=?,must_change_password=FALSE,password_changed_at=UTC_TIMESTAMP(),auth_version=auth_version+1 WHERE id=?', [hash, tokens[0].user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [tokens[0].user_id]);
    await audit(req, 'password_reset_completed', 'user', tokens[0].user_id, null, { db: connection, required: true });
    await connection.commit();
    return res.json({ message: 'Contraseña restablecida. Ya puedes iniciar sesión.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

module.exports = router;
