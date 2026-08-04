const path = require('node:path');

const PUBLIC_PATHS = new Set([
  '/mantenimiento.html',
  '/auth.css',
  '/assets/logo.png',
  '/api/health'
]);

function createMaintenanceMiddleware({ enabled, publicDirectory }) {
  const maintenancePage = path.join(publicDirectory, 'mantenimiento.html');
  return function maintenanceMiddleware(req, res, next) {
    if (!enabled || PUBLIC_PATHS.has(req.path) || req.session?.user?.role === 'superuser') return next();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '3600');
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: 'Servicio temporalmente en mantenimiento.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      return res.status(503).json({ error: 'Servicio temporalmente en mantenimiento.' });
    }
    return res.status(503).sendFile(maintenancePage);
  };
}

module.exports = { createMaintenanceMiddleware, PUBLIC_PATHS };
