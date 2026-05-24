import express from 'express';
import systemSettingsCache from '../services/systemSettingsCache.js';
import SystemSetting from '../models/SystemSetting.js';

const router = express.Router();

// Public read-only endpoint to fetch a setting value (cached)
router.get('/public/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (!systemSettingsCache.loaded) await systemSettingsCache.load();

    const entry = systemSettingsCache.getEntry(key) || (await SystemSetting.findOne({ key }).lean());
    if (!entry) return res.status(404).json({ message: 'Not found' });

    return res.json({ key: entry.key, value: entry.value, updatedAt: entry.updatedAt });
  } catch (err) {
    console.error('public setting error:', err);
    res.status(500).json({ message: 'Failed to fetch setting' });
  }
});

export default router;
