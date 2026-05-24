import SystemSetting from '../models/SystemSetting.js';

class SystemSettingsCache {
  constructor() {
    this.map = new Map();
    this.loaded = false;
  }

  async load() {
    try {
      const rows = await SystemSetting.find().lean();
      this.map = new Map(rows.map(r => [r.key, r]));
      this.loaded = true;
    } catch (err) {
      console.error('Failed to load system settings cache:', err);
    }
  }

  get(key) {
    const ent = this.map.get(key);
    return ent ? ent.value : undefined;
  }

  getEntry(key) {
    return this.map.get(key);
  }

  isMaintenanceMode() {
    const v = this.get('maintenance_mode');
    return v === true || String(v) === 'true';
  }

  async refreshKey(key) {
    try {
      const entry = await SystemSetting.findOne({ key }).lean();
      if (entry) this.map.set(key, entry);
      else this.map.delete(key);
    } catch (err) {
      console.error('Failed to refresh system setting key:', key, err);
    }
  }

  async setKey(key, value, meta = {}) {
    const updated = await SystemSetting.findOneAndUpdate(
      { key },
      { $set: { value, ...meta } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    this.map.set(key, updated);
    return updated;
  }
}

const systemSettingsCache = new SystemSettingsCache();
export default systemSettingsCache;
