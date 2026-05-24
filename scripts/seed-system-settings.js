import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../utils/connectDB.js';
import SystemSetting from '../models/SystemSetting.js';

const run = async () => {
  try {
    await connectDB();
    const key = 'maintenance_mode';
    const existing = await SystemSetting.findOne({ key }).lean();
    if (existing) {
      console.log('System setting already exists:', existing);
    } else {
      const created = await SystemSetting.create({ key, value: false, description: 'Toggle maintenance mode (boolean)' });
      console.log('Created system setting:', created);
    }
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
};

run();
