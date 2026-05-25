import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    permissions: [{ type: String, trim: true }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Role', roleSchema);