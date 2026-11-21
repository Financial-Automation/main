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

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
