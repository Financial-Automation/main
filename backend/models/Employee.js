import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  employeeId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "",
  },
  department: {
    type: String,
    required: true,
  },
  designation: {
    type: String,
    required: true,
  },
  joiningDate: {
    type: Date,
    default: Date.now,
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
  otherAllowance: {
    type: Number,
    default: 0,
  },
  bankAccount: {
    type: String,
    default: "",
  },
  ifscCode: {
    type: String,
    default: "",
  },
  bankName: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

employeeSchema.index({ userId: 1, employeeId: 1 }, { unique: true });

const Employee = mongoose.models.Employee || mongoose.model("Employee", employeeSchema);

export default Employee;
