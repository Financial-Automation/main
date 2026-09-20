import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InventoryItem"
  },
  productName: { type: String, required: true },
  description: { type: String, default: "" },
  codeType: { type: String, enum: ['HSN', 'SAC'], default: 'HSN' },
  hsnCode: { type: String, default: "" },
  sacCode: { type: String, default: "" },
  unit: { type: String, default: "Pcs" },
  priceWithTax: { type: Boolean, default: false },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  taxRate: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // Discount percentage or flat amount per item
  total: { type: Number, required: true }
});

const invoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  // Invoice Details
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
  paymentTerms: { type: String, default: "Net 15" },
  orderNumber: { type: String, default: "" },
  salespersonName: { type: String, default: "" },
  priceListId: { type: String, default: "" },
  currency: { type: String, default: "INR" },
  exchangeRate: { type: Number, default: 1 },

  // Customer Details
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  customerName: { type: String, required: true },
  customerEmail: { type: String, default: "" },
  customerPhone: { type: String, default: "" },
  customerAddress: { type: String, default: "" },
  customerGSTIN: { type: String, default: "" },

  // Business / Seller Details
  businessName: { type: String, required: true },
  businessEmail: { type: String, default: "" },
  businessPhone: { type: String, default: "" },
  businessAddress: { type: String, default: "" },
  businessGSTIN: { type: String, default: "" },

  // Invoice Items
  items: { type: [invoiceItemSchema], required: true },

  // Calculations
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  shippingCharges: { type: Number, default: 0 },
  packagingCharges: { type: Number, default: 0 },
  freightCharges: { type: Number, default: 0 },
  adjustment: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },

  // Tax Breakdown
  sgst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },

  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit', 'credit_card', 'bank_transfer', 'upi', 'gpay', 'netbanking', 'cheque', 'paypal', 'stripe', 'other'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'pending'
  },
  amountPaid: { type: Number, default: 0 },
  balanceDue: { type: Number, required: true },

  // Banking Details
  bankName: { type: String, default: "" },
  accountType: { type: String, default: "Current" },
  accountNumber: { type: String, default: "" },
  ifscCode: { type: String, default: "" },
  authorisedSignature: { type: String, default: "" },

  // Additional Information
  notes: { type: String, default: "" },
  termsAndConditions: { type: String, default: "" },
  invoiceType: {
    type: String,
    enum: ['proforma', 'tax', 'commercial', 'retail'],
    default: 'tax'
  },
  sourceInvoiceType: {
    type: String,
    enum: ['sales', 'purchase'],
    default: 'sales'
  },
  transactionType: {
    type: String,
    enum: ['B2B', 'B2C'],
    default: 'B2C'
  },
  invoiceSize: {
    type: String,
    enum: ['A4', 'QUARTER_A4', 'A6'],
    default: 'A4'
  },
  dueReminderDays: { type: Number, default: 0 },
  dueReminderDate: { type: Date },
  eWayBillNo: { type: String, default: "" },
  stateOfSupply: { type: String, default: "" },
  gstPortalJson: { type: mongoose.Schema.Types.Mixed },

  // Template Customization Fields
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InvoiceTemplate"
  },
  templateSnapshot: {
    type: mongoose.Schema.Types.Mixed
  },

  // System Fields
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false }
});

// Index declarations for performance and security scoping
invoiceSchema.index({ userId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ userId: 1, invoiceDate: -1 });
invoiceSchema.index({ customerId: 1 });

const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

export default Invoice;
