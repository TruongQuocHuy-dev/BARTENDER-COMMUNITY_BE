import { createAudit } from '../services/audit.service.js';

/**
 * Usage: audit(action, resourceType, getDetails?)
 * - action: short action key, e.g. 'delete_user'
 * - resourceType: e.g. 'User', 'Recipe', 'Post'
 * - getDetails: optional function (req, res) => details object
 */
export const audit = (action, resourceType, getDetails) => (req, res, next) => {
  // Log after response finished for successful requests
  res.on('finish', async () => {
    try {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const details = typeof getDetails === 'function' ? getDetails(req, res) : {};
        const resourceId = req.params?.id || req.body?.id || null;
        await createAudit(req, {
          action,
          resourceType,
          resourceId,
          details,
        });
      }
    } catch (err) {
      console.error('audit middleware error:', err);
    }
  });

  next();
};

export default audit;
