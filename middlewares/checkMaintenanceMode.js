import systemSettingsCache from '../services/systemSettingsCache.js';

const allowPaths = [
  '/api/admin',
  '/api/auth',
  '/api/v1/payments/ipn',
  '/api/v1/payments',
  '/health',
  '/',
];

export const checkMaintenanceMode = async (req, res, next) => {
  try {
    if (!systemSettingsCache.loaded) await systemSettingsCache.load();

    const isMaintenance = systemSettingsCache.isMaintenanceMode();
    if (!isMaintenance) return next();

    const path = req.originalUrl || req.url || '';
    for (const prefix of allowPaths) {
      if (path.startsWith(prefix)) return next();
    }

    return res.status(503).json({ message: 'Service is under maintenance' });
  } catch (err) {
    console.error('checkMaintenanceMode error:', err);
    next();
  }
};

export default checkMaintenanceMode;
