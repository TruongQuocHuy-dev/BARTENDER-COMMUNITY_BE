import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { sendNotificationToExternalIds, sendNotificationToPlayers } from '../services/notification.service.js';
import { createAudit } from '../services/audit.service.js';

const chunkArray = (arr, size) => {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

export const createCampaign = async (req, res) => {
  try {
    const { title, subtitle, body, data, segmentType = 'all', segmentOptions = {} } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body required' });

    const c = await Campaign.create({
      title,
      subtitle,
      body,
      data,
      segmentType,
      segmentOptions,
      createdBy: req.user?.id || req.user?._id,
    });

    res.status(201).json(c);
  } catch (err) {
    console.error('createCampaign error:', err);
    res.status(500).json({ message: 'Failed to create campaign' });
  }
};

export const listCampaigns = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;
    const filter = {};
    const [total, items] = await Promise.all([
      Campaign.countDocuments(filter),
      Campaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({ total, page, limit, items });
  } catch (err) {
    console.error('listCampaigns error:', err);
    res.status(500).json({ message: 'Failed to list campaigns' });
  }
};

export const getCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ message: 'Not found' });
    res.json(c);
  } catch (err) {
    console.error('getCampaign error:', err);
    res.status(500).json({ message: 'Failed to fetch campaign' });
  }
};

export const sendCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (campaign.status === 'sending') return res.status(409).json({ message: 'Campaign is already sending' });

    campaign.status = 'sending';
    await campaign.save();

    // Build list of external user ids to send to based on segmentType
    let targetIds = [];
    switch (campaign.segmentType) {
      case 'externalIds':
        targetIds = Array.isArray(campaign.segmentOptions.ids) ? campaign.segmentOptions.ids.map(String) : [];
        break;
      case 'all':
      default:
        // send to all active users
        const users = await User.find({ isActive: true, isBanned: { $ne: true } }).select('_id').lean();
        targetIds = users.map(u => String(u._id));
        break;
    }

    // batch and send
    const batches = chunkArray(targetIds, 500);
    let sent = 0;
    let failed = 0;
    const failures = [];

    for (const batch of batches) {
      try {
        // Using external user ids (OneSignal external_user_ids configured to match our user IDs)
        await sendNotificationToExternalIds(batch, { en: campaign.title }, { en: campaign.body }, campaign.data || {});
        sent += batch.length;
      } catch (err) {
        console.error('sendCampaign batch error:', err);
        failed += batch.length;
        failures.push({ error: String(err?.message || err), batchSize: batch.length });
      }
    }

    campaign.status = failed ? 'failed' : 'sent';
    campaign.sentAt = new Date();
    campaign.results = { sentCount: sent, failedCount: failed, failures };
    await campaign.save();

    // create audit entry
    try {
      await createAudit(req, {
        action: 'send_campaign',
        resourceType: 'Campaign',
        resourceId: campaign._id,
        details: { sent, failed },
      });
    } catch (e) {
      console.error('audit create failed for sendCampaign', e);
    }

    res.json({ message: 'Campaign send completed', sent, failed, failures });
  } catch (err) {
    console.error('sendCampaign error:', err);
    res.status(500).json({ message: 'Failed to send campaign' });
  }
};

export const previewCampaign = async (req, res) => {
  try {
    const { segmentType = 'all', segmentOptions = {} } = req.body || {};
    let filter = { isActive: true, isBanned: { $ne: true } };

    switch (segmentType) {
      case 'externalIds':
        // return exact ids
        const ids = Array.isArray(segmentOptions.ids) ? segmentOptions.ids.map(String) : [];
        return res.json({ total: ids.length, sample: ids.slice(0, 20) });
      case 'plan':
        if (!segmentOptions.planId) return res.status(400).json({ message: 'planId required' });
        // join with Subscription
        const subs = await (await import('../models/Subscription.js')).default.find({ planId: segmentOptions.planId }).select('user').lean();
        const userIds = subs.map(s => s.user.toString());
        const sampleUsersPlan = await User.find({ _id: { $in: userIds } }).select('fullName email location').limit(20).lean();
        return res.json({ total: userIds.length, sample: sampleUsersPlan });
      case 'activeSince':
        if (!segmentOptions.since) return res.status(400).json({ message: 'since date required' });
        const sinceDate = new Date(segmentOptions.since);
        // find users with device lastActive >= sinceDate
        const Device = (await import('../models/Device.js')).default;
        const devices = await Device.find({ lastActive: { $gte: sinceDate } }).select('user').lean();
        const activeUserIds = Array.from(new Set(devices.map(d => String(d.user))));
        const sampleActive = await User.find({ _id: { $in: activeUserIds } }).select('fullName email location').limit(20).lean();
        return res.json({ total: activeUserIds.length, sample: sampleActive });
      case 'country':
        if (!segmentOptions.country) return res.status(400).json({ message: 'country required' });
        filter.location = new RegExp(segmentOptions.country, 'i');
        break;
      case 'all':
      default:
        break;
    }

    const total = await User.countDocuments(filter);
    const sample = await User.find(filter).select('fullName email location').limit(20).lean();
    res.json({ total, sample });
  } catch (err) {
    console.error('previewCampaign error:', err);
    res.status(500).json({ message: 'Failed to preview campaign' });
  }
};

export default { createCampaign, listCampaigns, getCampaign, sendCampaign };
