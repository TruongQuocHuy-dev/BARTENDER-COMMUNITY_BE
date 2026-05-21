import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import { Types } from 'mongoose';

/**
 * GET /api/admin/audits
 * Query params: admin, action, resourceType, resourceId, from, to, page, limit
 */
export const queryAudits = async (req, res) => {
  try {
    const {
      admin,
      action,
      resourceType,
      resourceId,
      from,
      to,
      q,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (admin) filter.admin = admin;
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;
    if (resourceId) filter.resourceId = resourceId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    // server-side text search: match action, resourceType, or admin name/email
    if (q && String(q).trim()) {
      const qRegex = new RegExp(String(q).trim(), 'i');
      // find matching admins
      const matchedUsers = await User.find({
        $or: [{ fullName: qRegex }, { email: qRegex }],
      }).select('_id').lean();
      const userIds = matchedUsers.map(u => Types.ObjectId(u._id));

      filter.$or = [
        { action: qRegex },
        { resourceType: qRegex },
        ...(userIds.length ? [{ admin: { $in: userIds } }] : []),
      ];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.min(1000, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * perPage;

    const [total, items] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .populate('admin', 'fullName email'),
    ]);

    res.json({ total, page: pageNum, limit: perPage, items });
  } catch (err) {
    console.error('queryAudits error:', err);
    res.status(500).json({ message: 'Failed to query audit logs' });
  }
};

export default { queryAudits };

export const exportAudits = async (req, res) => {
  try {
    const { admin, action, resourceType, resourceId, from, to, q } = req.query;
    const filter = {};
    if (admin) filter.admin = admin;
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;
    if (resourceId) filter.resourceId = resourceId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (q && String(q).trim()) {
      const qRegex = new RegExp(String(q).trim(), 'i');
      const matchedUsers = await User.find({ $or: [{ fullName: qRegex }, { email: qRegex }] }).select('_id').lean();
      const userIds = matchedUsers.map(u => Types.ObjectId(u._id));
      filter.$or = [
        { action: qRegex },
        { resourceType: qRegex },
        ...(userIds.length ? [{ admin: { $in: userIds } }] : []),
      ];
    }

    // limit export size to prevent runaway memory usage
    const maxExport = 20000;
    const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(maxExport).populate('admin', 'fullName email');

    // build CSV
    const rows = [];
    const header = ['createdAt', 'adminEmail', 'adminName', 'action', 'resourceType', 'resourceId', 'details'];
    rows.push(header.join(','));

    for (const it of items) {
      const createdAt = it.createdAt ? it.createdAt.toISOString() : '';
      const adminEmail = it.admin?.email ? String(it.admin.email).replace(/"/g, '""') : '';
      const adminName = it.admin?.fullName ? String(it.admin.fullName).replace(/"/g, '""') : '';
      const actionVal = it.action ? String(it.action).replace(/"/g, '""') : '';
      const rType = it.resourceType ? String(it.resourceType).replace(/"/g, '""') : '';
      const rId = it.resourceId ? String(it.resourceId) : '';
      const details = it.details ? String(JSON.stringify(it.details)).replace(/"/g, '""') : '';

      const line = [`"${createdAt}"`,`"${adminEmail}"`,`"${adminName}"`,`"${actionVal}"`,`"${rType}"`,`"${rId}"`,`"${details}"`];
      rows.push(line.join(','));
    }

    const csv = rows.join('\n');
    const filename = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('exportAudits error:', err);
    res.status(500).json({ message: 'Failed to export audit logs' });
  }
};
