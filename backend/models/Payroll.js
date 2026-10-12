import mongoose from "mongoose";

const payrollSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  employeeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null,
  },
  employeeName: {
    type: String,
    required: true,
  },
  employeeId: {
    type: String,
    required: true,
    index: true,
  },
  employeeRole: {
    type: String,
    default: "Staff",
  },
  employeeDepartment: {
    type: String,
    default: "General",
  },
  payrollMonth: {
    type: String,
    required: true,
    index: true, // e.g. "2026-10"
  },
  payrollPeriod: {
    type: String,
    default: "October 2026",
  },
  basicSalary: {
    type: Number,
    required: true,
    default: 0,
  },
  da: {
    type: Number,
    default: 0,
  },
  hra: {
    type: Number,
    default: 0,
  },
  travelAllowance: {
    type: Number,
    default: 0,
  },
  overtimeAllowance: {
    type: Number,
    default: 0,
  },
  otherAllowance: {
    type: Number,
    default: 0,
  },
  bonuses: {
    type: Number,
    default: 0,
  },
  grossSalary: {
    type: Number,
    required: true,
    default: 0,
  },
  pfDeduction: {
    type: Number,
    default: 0,
  },
  epfDeduction: {
    type: Number,
    default: 0,
  },
  esiDeduction: {
    type: Number,
    default: 0,
  },
  taxDeduction: {
    type: Number,
    default: 0,
  },
  extraLeaveDeduction: {
    type: Number,
    default: 0,
  },
  advanceRecoveryDeduction: {
    type: Number,
    default: 0,
  },
  loanDeduction: {
    type: Number,
    default: 0,
  },
  otherDeduction: {
    type: Number,
    default: 0,
  },
  totalDeductions: {
    type: Number,
    required: true,
    default: 0,
  },
  netSalary: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    enum: ["draft", "calculated", "reviewed", "approved", "paid"],
    default: "draft",
    index: true,
  },
  bookkeepingEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BookkeepingEntry",
    default: null,
  },
  paymentDate: {
    type: Date,
    default: null,
  },
  paymentMethod: {
    type: String,
    default: "bank_transfer",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

payrollSchema.index({ userId: 1, employeeId: 1, payrollMonth: 1 }, { unique: true });
payrollSchema.index({ userId: 1, payrollMonth: 1, status: 1 });

const Payroll = mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema);

export default Payroll;
