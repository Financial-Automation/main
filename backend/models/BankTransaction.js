import mongoose from "mongoose";

const bankTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  statementId: {
    type: String,
    required: true,
    index: true,
  },
  transactionHash: {
    type: String,
    required: true, // Composite hash for duplicate import protection
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  description: {
    type: String,
    required: true,
  },
  referenceNumber: {
    type: String,
    default: "",
    index: true,
  },
  type: {
    type: String,
    enum: ["credit", "debit", "inflow", "outflow"],
    default: "credit",
  },
  amount: {
    type: Number,
    required: true,
  },
  runningBalance: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["unmatched", "matched", "reconciled", "ignored"],
    default: "unmatched",
    index: true,
  },
  matchedBookkeepingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BookkeepingEntry",
    default: null,
  },
  matchedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    default: null,
  },
  matchedCustomerName: {
    type: String,
    default: "",
  },
  matchedVendorName: {
    type: String,
    default: "",
  },
  matchScore: {
    type: Number,
    default: 0,
  },
  matchType: {
    type: String,
    default: "", // "exact", "strong", "possible", "manual"
  },
  matchReasons: [
    {
      type: String,
    },
  ],
  reconciledAt: {
    type: Date,
    default: null,
  },
  reconciledBy: {
    type: String,
    default: null,
  },
  notes: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

bankTransactionSchema.index({ userId: 1, transactionHash: 1 }, { unique: true });
bankTransactionSchema.index({ userId: 1, date: -1 });

const BankTransaction =
  mongoose.models.BankTransaction || mongoose.model("BankTransaction", bankTransactionSchema);

export default BankTransaction;
