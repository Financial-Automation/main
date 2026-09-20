import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  storePassword: { type: String },
  name: { type: String },
  role: { type: String, enum: ["admin", "instore"], default: "admin" },
  subscriptionStatus: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  subscriptionPlan: { type: String, enum: ["trial", "monthly", "annual", "lifetime"], default: "monthly" },
  subscriptionAmount: { type: Number },
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  pendingDowngradePlan: { type: String, enum: ["trial", "monthly", "annual", "lifetime"] },
  trialEndDate: { type: Date },
  razorpayPaymentId: { type: String },
  razorpayOrderId: { type: String },
  createdAt: { type: Date, default: Date.now },
  sellerName: { type: String },
  sellerPhone: { type: String },
  sellerEmail: { type: String },
  sellerGSTIN: { type: String },
  sellerState: { type: String },
  sellerAddress: { type: String },
  bankName: { type: String, default: "" },
  accountType: { type: String, default: "Current" },
  accountNumber: { type: String, default: "" },
  ifscCode: { type: String, default: "" },
  authorisedSignature: { type: String, default: "" },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
