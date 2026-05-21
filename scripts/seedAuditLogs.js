import 'dotenv/config';
import { connectDB } from '../utils/connectDB.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';

const SAMPLE_ACTIONS = ['delete_user','update_user','approve_recipe','reject_recipe','delete_post','delete_comment','approve_all_pending_recipes'];
const RESOURCE_TYPES = ['User','Recipe','Post','Comment','Banner',null];

async function ensureAdmin() {
  let admin = await User.findOne({ role: 'admin' }).lean();
  if (admin) return admin;

  const hashed = await bcrypt.hash('adminpass', 10);
  const created = await User.create({ fullName: 'Seed Admin', email: 'seed-admin@example.com', password: hashed, role: 'admin', isVerified: true });
  return created;
}

function randomInt(max) { return Math.floor(Math.random()*max) }

export async function seed(count = 200) {
  await connectDB();
  const admin = await ensureAdmin();

  const docs = [];
  for (let i=0;i<count;i++) {
    const action = SAMPLE_ACTIONS[randomInt(SAMPLE_ACTIONS.length)];
    const resourceType = RESOURCE_TYPES[randomInt(RESOURCE_TYPES.length)];
    const resourceId = resourceType ? Types.ObjectId() : null;
    const createdAt = new Date(Date.now() - randomInt(30)*24*60*60*1000 - randomInt(24)*60*60*1000);
    docs.push({
      admin: admin._id,
      action,
      resourceType,
      resourceId,
      details: { sample: true, note: `Seeded ${action}` },
      createdAt,
    });
  }

  await AuditLog.insertMany(docs);
  console.log(`Inserted ${count} audit log entries.`);
  process.exit(0);
}

if (require.main === module) {
  const n = Number(process.argv[2] || 200);
  seed(n).catch(err=>{ console.error(err); process.exit(1) });
}
