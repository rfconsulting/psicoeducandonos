const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const { rateLimit } = require('express-rate-limit');
const env = require('./config/env');
const pool = require('./config/database');
const { issueCsrfToken } = require('./middleware/security');
const { requireRole } = require('./middleware/security');
const logger = require('./services/logger');

const app = express();
if (env.trustProxy) app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  res.on('finish', () => {
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      userId: req.session?.user?.id || null
    });
  });
  next();
});
app.use((req, res, next) => {
  if (!env.isProduction || req.path === '/api/health') return next();
  const canonical = new URL(env.appPublicUrl);
  const hostname = String(req.hostname || '').toLowerCase();
  if (!req.secure || hostname !== canonical.hostname) {
    return res.redirect(308, `${canonical.origin}${req.originalUrl}`);
  }
  return next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: env.isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '64kb', type: 'application/json', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 50 }));
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.is('application/json') && (!req.body || Array.isArray(req.body) || typeof req.body !== 'object')) {
    return res.status(400).json({ error: 'El cuerpo JSON debe ser un objeto.' });
  }
  return next();
});

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  ...env.db,
  createDatabaseTable: true,
  schema: { tableName: 'user_sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } }
});

app.use(session({
  name: 'psico.sid',
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: env.isProduction, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

const limiterOptions = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-8', legacyHeaders: false };
const loginLimiter = rateLimit({ ...limiterOptions, limit: 10, message: { error: 'Demasiados intentos de acceso. Espera unos minutos.' } });
const applicationLimiter = rateLimit({ ...limiterOptions, limit: 5, message: { error: 'Demasiadas postulaciones. Espera unos minutos.' } });
const recoveryLimiter = rateLimit({ ...limiterOptions, limit: 5, message: { error: 'Demasiadas solicitudes de recuperación. Espera unos minutos.' } });
const apiLimiter = rateLimit({ ...limiterOptions, limit: 300, message: { error: 'Demasiadas solicitudes. Espera unos minutos.' } });
app.use('/api', apiLimiter);
app.get('/api/csrf-token', issueCsrfToken);
app.use('/api/auth/login', loginLimiter);
app.post('/api/applications', applicationLimiter);
app.use('/api/auth/forgot-password', recoveryLimiter);
app.use('/api/auth/reset-password', recoveryLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/content', require('./routes/content'));
app.use('/api/learning', require('./routes/learning'));
app.use('/api/audit-log', require('./routes/audit-log'));
app.use('/api/applications', require('./routes/applications'));
app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    const knownCodes = new Set(['ER_ACCESS_DENIED_ERROR', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST']);
    res.status(503).json({
      status: 'degraded',
      component: 'database',
      code: knownCodes.has(error.code) ? error.code : 'DATABASE_UNAVAILABLE'
    });
  }
});

app.get(['/dashboard', '/dashboard.html'], requireRole('superuser', 'administrator', 'teacher', 'writer'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});
app.get(['/estudiante', '/estudiante.html'], requireRole('student'), (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'estudiante.html'));
});
app.get(['/registro', '/registro.html'], (_req, res) => res.redirect(302, '/postulacion.html'));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: env.isProduction ? '1h' : 0 }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((error, req, res, _next) => {
  logger.error('request_failed', { requestId: req.requestId, errorName: error.name, errorCode: error.code || null });
  if (res.headersSent) return;
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo JSON no es válido.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud excede el tamaño permitido.' });
  res.status(500).json({ error: 'Ocurrió un error interno.' });
});

const server = app.listen(env.port, () => logger.info('server_started', { port: env.port, environment: env.nodeEnv }));
async function shutdown() { server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
