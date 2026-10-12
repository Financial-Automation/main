import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  companyName: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "",
  },
  billingAddress: {
    type: String,
    default: "",
  },
  shippingAddress: {
    type: String,
    default: "",
  },
  gstin: {
    type: String,
    default: "",
  },
  placeOfSupply: {
    type: String,
    default: "",
  },
  paymentTerms: {
    type: String,
    default: "Due on Receipt",
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
  outstandingBalance: {
    type: Number,
    default: 0,
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

customerSchema.index({ userId: 1, name: 1 });
customerSchema.index({ userId: 1, status: 1 });

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;

