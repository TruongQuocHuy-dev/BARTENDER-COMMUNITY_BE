import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    action: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: false },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: 'createdAt' } },
);

const AuditLog = mongoose.model('AuditLog', auditSchema);

export default AuditLog;
