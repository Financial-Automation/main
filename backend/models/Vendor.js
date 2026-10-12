import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema({
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
  address: {
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
    default: "Net 30",
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
  outstandingPayable: {
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

vendorSchema.index({ userId: 1, name: 1 });
vendorSchema.index({ userId: 1, status: 1 });

const Vendor = mongoose.models.Vendor || mongoose.model("Vendor", vendorSchema);

export default Vendor;
