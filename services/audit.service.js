import AuditLog from '../models/AuditLog.js';

export const createAudit = async (reqOrMeta = {}, { action, resourceType, resourceId, details } = {}) => {
  try {
    let adminId = null;
    let ip = undefined;
    let userAgent = undefined;

    if (reqOrMeta && reqOrMeta.user) {
      adminId = reqOrMeta.user._id;
      ip = reqOrMeta.ip || reqOrMeta.headers?.['x-forwarded-for'] || reqOrMeta.connection?.remoteAddress;
      userAgent = reqOrMeta.headers?.['user-agent'];
    } else if (reqOrMeta && typeof reqOrMeta === 'object') {
      adminId = reqOrMeta.adminId || null;
      ip = reqOrMeta.ip;
      userAgent = reqOrMeta.userAgent;
    }

    await AuditLog.create({
      admin: adminId,
      action,
      resourceType,
      resourceId,
      details,
      ip,
      userAgent,
    });
  } catch (err) {
    // Do not throw — audit errors should not block main flows
    console.error('createAudit error:', err);
  }
};
