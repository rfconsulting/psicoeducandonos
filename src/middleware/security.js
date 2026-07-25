const crypto = require('node:crypto');
const env = require('../config/env');
const pool = require('../config/database');
const { hasCapability } = require('../constants/access');
const { ROLES } = require('../constants/access');

const PASSWORD_CHANGE_ROUTES = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);
const MFA_BOOTSTRAP_ROUTES = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/mfa/setup', '/api/auth/mfa/verify', '/api/auth/logout']);

function isPasswordChangeRoute(path) {
  return PASSWORD_CHANGE_ROUTES.has(path);
}

function isMfaBootstrapRoute(path) {
  return MFA_BOOTSTRAP_ROUTES.has(path);
}

function rejectSession(req, res, message = 'Tu sesión ya no es válida. Inicia sesión nuevamente.') {
  if (!req.session) return res.status(401).json({ error: message });
  req.session.destroy(() => {
    res.clearCookie('psico.sid', { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/' });
    res.status(401).json({ error: message });
  });
}

function isSessionUserCurrent(sessionUser, user) {
  return Boolean(user)
    && user.status === 'active'
    && Number(sessionUser?.authVersion) === Number(user.auth_version)
    && sessionUser?.role === user.role;
}

async function validateSession(req, res, next, allowedRoles = null) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) return res.status(401).json({ error: 'Debes iniciar sesión.' });

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role, status, auth_version, must_change_password, mfa_enabled FROM users WHERE id = ? LIMIT 1',
      [sessionUser.id]
    );
    const user = rows[0];
    const stale = !isSessionUserCurrent(sessionUser, user);

    if (stale) return rejectSession(req, res);
    const requestPath = req.originalUrl.split('?')[0];
    const passwordChangeAllowed = isPasswordChangeRoute(requestPath);
    if (user.must_change_password && !passwordChangeAllowed) {
      return res.status(403).json({ error: 'Debes cambiar tu contraseña temporal.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    const privileged = [ROLES.SUPERUSER, ROLES.ADMINISTRATOR].includes(user.role);
    // Una contraseña temporal debe reemplazarse antes de iniciar el desafío MFA.
    // El cambio destruye la sesión, por lo que MFA se exigirá en el siguiente acceso.
    const mfaAllowed = isMfaBootstrapRoute(requestPath);
    if (privileged && req.session.mfaVerified !== true && !mfaAllowed) {
      return res.status(403).json({ error: 'Debes completar la verificación en dos pasos.', code: 'MFA_REQUIRED' });
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }

    req.authUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  return validateSession(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => validateSession(req, res, next, roles);
}

function requireCapability(capability) {
  return (req, res, next) => validateSession(req, res, (error) => {
    if (error) return next(error);
    if (!hasCapability(req.authUser.role, capability)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    return next();
  });
}

function issueCsrfToken(req, res) {
  if (!req.session.csrfToken) req.session.csrfToken = env.randomToken();
  res.json({ csrfToken: req.session.csrfToken });
}

function verifyCsrf(req, res, next) {
  const expected = req.session?.csrfToken;
  const received = req.get('x-csrf-token');
  if (!expected || !received) return res.status(403).json({ error: 'Token de seguridad inválido. Recarga la página.' });
  const valid = expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!valid) return res.status(403).json({ error: 'Token de seguridad inválido. Recarga la página.' });
  return next();
}

module.exports = {
  requireAuth, requireRole, requireCapability, issueCsrfToken, verifyCsrf,
  isPasswordChangeRoute, isMfaBootstrapRoute, isSessionUserCurrent
};
