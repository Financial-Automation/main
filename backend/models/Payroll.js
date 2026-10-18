import mongoose from "mongoose";

const payrollSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeName: { type: String, required: true },
  employeeId: { type: String, required: true },
  employeeRole: { type: String, required: true },
  employeeDepartment: { type: String, required: true },
  employeeExperience: { type: Number, required: true },
  basicSalary: { type: Number, required: true },
  da: { type: Number, required: true },
  hra: { type: Number, required: true },
  travelAllowance: { type: Number, required: true },
  overtimeAllowance: { type: Number, default: 0 },
  otherAllowance: { type: Number, required: true },
  bonuses: { type: Number, required: true },
  grossSalary: { type: Number, required: true },
  pfDeduction: { type: Number, required: true },
  epfDeduction: { type: Number, required: true },
  esiDeduction: { type: Number, default: 0 },
  taxDeduction: { type: Number, required: true },
  extraLeaveDeduction: { type: Number, default: 0 },
  advanceRecoveryDeduction: { type: Number, default: 0 },
  loanDeduction: { type: Number, default: 0 },
  otherDeduction: { type: Number, default: 0 },
  totalDeductions: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

payrollSchema.index({ userId: 1, employeeId: 1, createdAt: -1 });

const Payroll = mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema);

export default Payroll;
