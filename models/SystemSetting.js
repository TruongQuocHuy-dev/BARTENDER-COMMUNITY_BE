import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed },
    description: { type: String },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

export default SystemSetting;
