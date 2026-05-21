import 'dotenv/config';
import axios from 'axios';
import { connectDB } from '../utils/connectDB.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const API_BASE = process.env.API_BASE_URL || process.env.API_BASE || 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'bartender_secret';

async function ensureAdminAndToken() {
  await connectDB();
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    const hashed = await bcrypt.hash('adminpass', 10);
    admin = await User.create({ fullName: 'Test Admin', email: 'test-admin@example.com', password: hashed, role: 'admin', isVerified: true });
  }
  const token = jwt.sign({ userId: admin._id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });
  return token;
}

async function run() {
  const token = await ensureAdminAndToken();
  const headers = { Authorization: `Bearer ${token}` };

  console.log('Running integration tests against', API_BASE);

  // 1) Ensure audits endpoint returns paginated data
  const res1 = await axios.get(`${API_BASE}/admin/audits`, { headers, params: { limit: 10, page: 1 } });
  if (res1.status !== 200) throw new Error('Audits endpoint failed');
  const { items, total } = res1.data;
  console.log('Audits query:', items.length, 'items, total=', total);
  if (!Array.isArray(items)) throw new Error('Invalid items format');

  // 2) Test q search
  const res2 = await axios.get(`${API_BASE}/admin/audits`, { headers, params: { q: 'approve', limit: 5 } });
  if (res2.status !== 200) throw new Error('Audits q search failed');
  console.log('q-search returned', res2.data.items.length, 'items');

  // 3) Test CSV export
  const res3 = await axios.get(`${API_BASE}/admin/audits/export`, { headers, params: { q: 'approve' }, responseType: 'text' });
  if (res3.status !== 200) throw new Error('Export endpoint failed');
  if (!res3.data.includes('createdAt')) throw new Error('CSV header missing');
  console.log('Export CSV size:', res3.data.length);

  console.log('All integration tests passed ✅');
  process.exit(0);
}

run().catch(err=>{ console.error('Integration tests failed:', err.message || err); process.exit(1) });
