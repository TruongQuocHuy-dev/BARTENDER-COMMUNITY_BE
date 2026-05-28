import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    body: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    // segment: { type: String, enum: ['all','externalIds','plan','activeSince','country'], default: 'all' }
    segmentType: { type: String, required: true, default: 'all' },
    segmentOptions: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['draft','sending','sent','failed'], default: 'draft' },
    sentAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    results: {
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      failures: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
  },
  { timestamps: true },
);

const Campaign = mongoose.model('Campaign', campaignSchema);

export default Campaign;
