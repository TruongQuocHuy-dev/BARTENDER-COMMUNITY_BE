import Role from '../models/Role.js';

export const AVAILABLE_PERMISSIONS = [
  'dashboard:read',
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'users:read',
  'users:update',
  'users:delete',
  'posts:read',
  'posts:create',
  'posts:delete',
  'comments:delete',
  'reports:read',
  'reports:update',
  'reports:delete',
  'recipes:read',
  'recipes:approve',
  'recipes:reject',
  'recipes:import',
  'recipes:moderate',
  'payments:read',
  'payments:refund',
  'payments:export',
  'system:read',
  'system:update',
  'notifications:send',
];

const DEFAULT_ROLES = [
  {
    name: 'user',
    displayName: 'Người dùng',
    description: 'Vai trò mặc định cho người dùng thường',
    permissions: [],
    isSystem: true,
  },
  {
    name: 'admin',
    displayName: 'Quản trị viên',
    description: 'Toàn quyền quản trị hệ thống',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: 'moderator',
    displayName: 'Kiểm duyệt',
    description: 'Duyệt nội dung và xử lý moderation workflow',
    permissions: ['dashboard:read', 'reports:read', 'reports:update', 'recipes:read', 'recipes:approve', 'recipes:reject', 'recipes:moderate', 'posts:delete', 'comments:delete'],
    isSystem: true,
  },
  {
    name: 'support',
    displayName: 'Hỗ trợ',
    description: 'Hỗ trợ người dùng và xem báo cáo',
    permissions: ['dashboard:read', 'users:read', 'reports:read', 'system:read'],
    isSystem: true,
  },
  {
    name: 'finance',
    displayName: 'Tài chính',
    description: 'Xử lý giao dịch và hoàn tiền',
    permissions: ['dashboard:read', 'payments:read', 'payments:refund', 'payments:export'],
    isSystem: true,
  },
];

const normalizeRoleName = (value) => String(value || '').trim().toLowerCase();

export const sanitizePermissions = (permissions = []) => {
  const uniquePermissions = new Set();
  for (const permission of permissions) {
    const normalized = String(permission || '').trim();
    if (!normalized) continue;
    if (normalized === '*' || AVAILABLE_PERMISSIONS.includes(normalized)) {
      uniquePermissions.add(normalized);
    }
  }
  return Array.from(uniquePermissions);
};

export const ensureDefaultRoles = async () => {
  await Promise.all(
    DEFAULT_ROLES.map((role) =>
      Role.findOneAndUpdate(
        { name: role.name },
        { $set: role },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    ),
  );
};

export const listRoles = async () => {
  await ensureDefaultRoles();
  return Role.find().sort({ isSystem: -1, displayName: 1 }).lean();
};

export const getRoleByName = async (roleName) => {
  const normalizedRoleName = normalizeRoleName(roleName);
  if (!normalizedRoleName) return null;
  await ensureDefaultRoles();
  return Role.findOne({ name: normalizedRoleName }).lean();
};

export const resolvePermissionsForRole = async (roleName) => {
  const normalizedRoleName = normalizeRoleName(roleName) || 'user';

  if (normalizedRoleName === 'admin') {
    return ['*'];
  }

  const role = await getRoleByName(normalizedRoleName);
  return role?.permissions || [];
};

export const attachRoleContext = async (userDoc) => {
  if (!userDoc) return null;

  const plainUser = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  const roleName = normalizeRoleName(plainUser.role) || 'user';
  const role = roleName === 'admin'
    ? {
        name: 'admin',
        displayName: 'Quản trị viên',
        description: 'Toàn quyền quản trị hệ thống',
        permissions: ['*'],
        isSystem: true,
      }
    : await getRoleByName(roleName);

  const permissions = role?.permissions || (roleName === 'admin' ? ['*'] : []);

  return {
    ...plainUser,
    id: plainUser._id?.toString?.() || plainUser.id,
    role: roleName,
    permissions,
    roleMeta: role || null,
  };
};

export const hasPermission = (user, permission) => {
  if (!user || !permission) return false;
  if (user.role === 'admin') return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
};

export const isSystemRoleName = (roleName) => ['user', 'admin', 'moderator', 'support', 'finance'].includes(normalizeRoleName(roleName));