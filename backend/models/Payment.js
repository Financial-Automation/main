import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true,
  },
  paymentNumber: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "credit", "credit_card", "bank_transfer", "upi", "gpay", "netbanking", "cheque", "paypal", "stripe", "other"],
    default: "cash",
  },
  depositAccount: {
    type: String,
    default: "Undeposited Funds",
  },
  referenceNumber: {
    type: String,
    default: "",
  },
  notes: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  idempotencyKey: {
    type: String,
    default: "",
    index: true,
  }
});

paymentSchema.index({ userId: 1, invoiceId: 1 });
paymentSchema.index({ userId: 1, paymentDate: -1 });
paymentSchema.index({ invoiceId: 1, idempotencyKey: 1 }, { sparse: true });

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export default Payment;
