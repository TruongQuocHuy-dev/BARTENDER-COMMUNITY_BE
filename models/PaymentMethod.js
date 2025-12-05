// models/PaymentMethod.js
import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    // 👇 Liên kết 1-nhiều với User
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, enum: ["vnpay", "momo", "card"], required: true },
    label: { type: String, required: true }, // "VNPay của tôi"
    isDefault: { type: Boolean, default: false },
    // Bạn có thể lưu thêm metadata nếu cần
    // metadata: { ... } 
  },
  { timestamps: true }
);

// Hook để đảm bảo chỉ có 1 phương thức là default
paymentMethodSchema.pre("save", async function (next) {
  if (this.isModified("isDefault") && this.isDefault) {
    // Nếu cái này được set là default, set tất cả cái khác là false
    await mongoose
      .model("PaymentMethod")
      .updateMany(
        { user: this.user, _id: { $ne: this._id } },
        { $set: { isDefault: false } }
      );
  }
  next();
});

export default mongoose.model("PaymentMethod", paymentMethodSchema);