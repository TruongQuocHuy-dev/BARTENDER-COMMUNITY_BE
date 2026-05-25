import { hasPermission } from '../services/role.service.js';

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  if (hasPermission(req.user, permission)) {
    return next();
  }

  return res.status(403).json({ message: `Missing permission: ${permission}` });
};

export const requireAnyPermission = (permissions = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const allowed = permissions.some((permission) => hasPermission(req.user, permission));
  if (allowed) {
    return next();
  }

  return res.status(403).json({ message: 'Missing required permission' });
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const normalizedRoles = roles.map((role) => String(role || '').trim().toLowerCase());
  if (normalizedRoles.includes(String(req.user.role || '').trim().toLowerCase())) {
    return next();
  }

  return res.status(403).json({ message: 'Missing required role' });
};