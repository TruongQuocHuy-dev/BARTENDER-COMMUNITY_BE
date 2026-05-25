import Role from '../models/Role.js';
import { AVAILABLE_PERMISSIONS, ensureDefaultRoles, sanitizePermissions } from '../services/role.service.js';

const normalizeRolePayload = (body = {}) => ({
  name: String(body.name || '').trim().toLowerCase(),
  displayName: String(body.displayName || '').trim(),
  description: String(body.description || '').trim(),
  permissions: sanitizePermissions(Array.isArray(body.permissions) ? body.permissions : []),
});

export const getAvailablePermissions = async (_req, res) => {
  await ensureDefaultRoles();
  res.json({ permissions: AVAILABLE_PERMISSIONS });
};

export const getRoles = async (_req, res) => {
  try {
    await ensureDefaultRoles();
    const roles = await Role.find().sort({ isSystem: -1, displayName: 1 }).lean();
    res.json(roles);
  } catch (err) {
    console.error('getRoles error:', err);
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
};

export const createRole = async (req, res) => {
  try {
    const payload = normalizeRolePayload(req.body);

    if (!payload.name || !payload.displayName) {
      return res.status(400).json({ message: 'Role name and display name are required' });
    }

    if (await Role.findOne({ name: payload.name })) {
      return res.status(400).json({ message: 'Role already exists' });
    }

    const role = await Role.create({
      ...payload,
      isSystem: !!req.body.isSystem,
    });

    res.status(201).json(role);
  } catch (err) {
    console.error('createRole error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Role already exists' });
    }
    res.status(500).json({ message: 'Failed to create role' });
  }
};

export const updateRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const payload = normalizeRolePayload(req.body);

    if (role.isSystem) {
      payload.name = role.name;

      if (role.name === 'user') {
        payload.permissions = [];
        payload.displayName = payload.displayName || 'Người dùng';
      }

      if (role.name === 'admin') {
        payload.permissions = ['*'];
        payload.displayName = payload.displayName || 'Quản trị viên';
      }

      payload.isSystem = true;
    }

    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...payload,
          ...(role.isSystem ? {} : { name: payload.name }),
        },
      },
      { new: true, runValidators: true },
    );

    res.json(updatedRole);
  } catch (err) {
    console.error('updateRole error:', err);
    res.status(500).json({ message: 'Failed to update role' });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    if (role.isSystem) {
      return res.status(400).json({ message: 'System roles cannot be deleted' });
    }

    await role.deleteOne();
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('deleteRole error:', err);
    res.status(500).json({ message: 'Failed to delete role' });
  }
};