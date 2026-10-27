import mongoose from "mongoose";

const configSchema = new mongoose.Schema({
  header: {
    showLogo: { type: Boolean, default: true },
    logoPosition: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
    logoSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    logoUrl: { type: String, default: '' },
    showCompanyName: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showEmail: { type: Boolean, default: true }
  },
  seller: {
    showName: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showEmail: { type: Boolean, default: true },
    showGSTIN: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: true }
  },
  customer: {
    showName: { type: Boolean, default: true },
    showGSTIN: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showEmail: { type: Boolean, default: true },
    showBillingAddress: { type: Boolean, default: true },
    showShippingAddress: { type: Boolean, default: true },
    showPlaceOfSupply: { type: Boolean, default: true }
  },
  invoiceInfo: {
    showInvoiceNumber: { type: Boolean, default: true },
    showInvoiceDate: { type: Boolean, default: true },
    showDueDate: { type: Boolean, default: true },
    showPaymentTerms: { type: Boolean, default: true },
    showOrderNumber: { type: Boolean, default: true },
    showSalesperson: { type: Boolean, default: true },
    labels: {
      invoiceNumber: { type: String, default: 'Invoice No.' },
      invoiceDate: { type: String, default: 'Invoice Date' },
      dueDate: { type: String, default: 'Due Date' },
      paymentTerms: { type: String, default: 'Payment Terms' },
      orderNumber: { type: String, default: 'Order No.' },
      salespersonName: { type: String, default: 'Salesperson' }
    }
  },
  items: {
    columns: { 
      type: [String], 
      default: ['item', 'description', 'hsn', 'quantity', 'rate', 'tax', 'amount'] 
    },
    labels: {
      item: { type: String, default: 'Item' },
      description: { type: String, default: 'Description' },
      sku: { type: String, default: 'SKU' },
      hsn: { type: String, default: 'HSN/SAC' },
      quantity: { type: String, default: 'Qty' },
      rate: { type: String, default: 'Rate' },
      tax: { type: String, default: 'Tax' },
      amount: { type: String, default: 'Amount' }
    }
  },
  tax: {
    showSummary: { type: Boolean, default: true },
    showCGST: { type: Boolean, default: true },
    showSGST: { type: Boolean, default: true },
    showIGST: { type: Boolean, default: true },
    showTaxableAmount: { type: Boolean, default: true },
    showTotalTax: { type: Boolean, default: true }
  },
  payment: {
    showPaidAmount: { type: Boolean, default: true },
    showBalance: { type: Boolean, default: true },
    showPaymentMethod: { type: Boolean, default: true }
  },
  notes: {
    show: { type: Boolean, default: true },
    label: { type: String, default: 'Notes' },
    defaultText: { type: String, default: 'Thank you for your business!' }
  },
  terms: {
    show: { type: Boolean, default: true },
    label: { type: String, default: 'Terms & Conditions' },
    defaultText: { type: String, default: 'Payment is due within 15 days of invoice date.' }
  },
  signature: {
    show: { type: Boolean, default: false },
    name: { type: String, default: '' },
    designation: { type: String, default: '' },
    imageUrl: { type: String, default: '' }
  },
  footer: {
    show: { type: Boolean, default: true },
    text: { type: String, default: 'Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨.' }
  },
  design: {
    primaryColor: { type: String, default: '#4f46e5' }, // indigo-600
    secondaryColor: { type: String, default: '#f8fafc' }, // slate-50
    textColor: { type: String, default: '#0f172a' }, // slate-900
    backgroundColor: { type: String, default: '#ffffff' },
    borderColor: { type: String, default: '#cbd5e1' }, // slate-300
    fontFamily: { type: String, default: 'Inter' },
    fontSize: { type: Number, default: 12 },
    headingSize: { type: Number, default: 18 },
    bodySize: { type: Number, default: 12 },
    borderStyle: { type: String, enum: ['none', 'light', 'medium'], default: 'light' },
    cornerRadius: { type: Number, default: 8 }
  },
  layout: {
    type: String,
    default: 'modern-indigo'
  },
  sectionsOrder: {
    type: [String],
    default: [
      'header',
      'seller',
      'customer',
      'invoiceInfo',
      'items',
      'tax',
      'payment',
      'notes',
      'signature',
      'footer'
    ]
  }
}, { _id: false });

const invoiceTemplateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  config: {
    type: configSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

// Enforce unique name per user
invoiceTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

const InvoiceTemplate = mongoose.model("InvoiceTemplate", invoiceTemplateSchema);
export default InvoiceTemplate;
