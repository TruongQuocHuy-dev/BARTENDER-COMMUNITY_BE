import SystemSetting from '../models/SystemSetting.js';
import systemSettingsCache from '../services/systemSettingsCache.js';

export const listSettings = async (req, res) => {
  try {
    const items = await SystemSetting.find().lean();
    res.json(items);
  } catch (err) {
    console.error('listSettings error:', err);
    res.status(500).json({ message: 'Failed to list settings' });
  }
};

export const getSetting = async (req, res) => {
  try {
    const key = req.params.key;
    const entry = await SystemSetting.findOne({ key }).lean();
    if (!entry) return res.status(404).json({ message: 'Not found' });
    res.json(entry);
  } catch (err) {
    console.error('getSetting error:', err);
    res.status(500).json({ message: 'Failed to get setting' });
  }
};

export const upsertSetting = async (req, res) => {
  try {
    const key = req.params.key || req.body.key;
    if (!key) return res.status(400).json({ message: 'Key required' });
    const value = req.body.value;

    const meta = {};
    if (req.user?.id) meta.updatedBy = req.user.id;

    const updated = await systemSettingsCache.setKey(key, value, meta);
    res.json(updated);
  } catch (err) {
    console.error('upsertSetting error:', err);
    res.status(500).json({ message: 'Failed to save setting' });
  }
};

export const deleteSetting = async (req, res) => {
  try {
    const key = req.params.key;
    await SystemSetting.deleteOne({ key });
    await systemSettingsCache.refreshKey(key);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteSetting error:', err);
    res.status(500).json({ message: 'Failed to delete setting' });
  }
};

export default { listSettings, getSetting, upsertSetting, deleteSetting };
