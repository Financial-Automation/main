import mongoose from "mongoose";

const budgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  budgetAmount: {
    type: Number,
    required: true,
    min: [0, "Budget amount cannot be negative"],
  },
  period: {
    type: String,
    default: "monthly", // e.g., "monthly", "2026-10"
  },
  month: {
    type: Number, // 1 to 12
    default: null,
  },
  year: {
    type: Number, // e.g. 2026
    default: null,
  },
  notes: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

budgetSchema.index({ userId: 1, category: 1, period: 1 });
budgetSchema.index({ userId: 1, status: 1 });

const Budget = mongoose.models.Budget || mongoose.model("Budget", budgetSchema);

export default Budget;
