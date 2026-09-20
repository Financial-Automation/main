import mongoose from "mongoose";

const purchaseConfigSchema = new mongoose.Schema({
  header: {
    showLogo: { type: Boolean, default: true },
    logoUrl: { type: String, default: '' },
    headerTitle: { type: String, default: 'TAX INVOICE / PURCHASE BILL' },
    showCompanyName: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true }
  },
  supplier: {
    showName: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showGSTIN: { type: Boolean, default: true },
    showState: { type: Boolean, default: true }
  },
  customer: {
    showName: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showGSTIN: { type: Boolean, default: true },
    showType: { type: Boolean, default: true }
  },
  items: {
    columns: {
      type: [String],
      default: ['item', 'hsn', 'quantity', 'unit', 'rate', 'tax', 'amount']
    },
    labels: {
      item: { type: String, default: 'Item' },
      hsn: { type: String, default: 'HSN/SAC' },
      quantity: { type: String, default: 'Qty' },
      unit: { type: String, default: 'Unit' },
      rate: { type: String, default: 'Price/Unit' },
      tax: { type: String, default: 'Tax' },
      amount: { type: String, default: 'Amount' }
    }
  },
  tax: {
    showSummary: { type: Boolean, default: true },
    showCGST: { type: Boolean, default: true },
    showSGST: { type: Boolean, default: true },
    showIGST: { type: Boolean, default: true },
    showTotalTax: { type: Boolean, default: true }
  },
  payment: {
    showPaidAmount: { type: Boolean, default: true },
    showBalance: { type: Boolean, default: true },
    showPaymentMethod: { type: Boolean, default: true }
  },
  notes: {
    show: { type: Boolean, default: true },
    label: { type: String, default: 'Purchase Notes' },
    defaultText: { type: String, default: 'Goods received in good condition.' }
  },
  terms: {
    show: { type: Boolean, default: true },
    label: { type: String, default: 'Terms & Conditions' },
    defaultText: { type: String, default: 'Payment terms as per vendor agreement.' }
  },
  design: {
    primaryColor: { type: String, default: '#d97706' }, // amber-600
    secondaryColor: { type: String, default: '#fffbeb' },
    textColor: { type: String, default: '#0f172a' },
    fontFamily: { type: String, default: 'Inter' },
    invoiceSize: { type: String, enum: ['A4', 'A5'], default: 'A4' },
    invoiceFormat: { type: String, enum: ['Supermarket', 'Hotel', 'Stationery Shop', 'Wholesale'], default: 'Supermarket' }
  }
}, { _id: false });

const purchaseInvoiceTemplateSchema = new mongoose.Schema({
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
  config: {
    type: purchaseConfigSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

purchaseInvoiceTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

const PurchaseInvoiceTemplate = mongoose.model("PurchaseInvoiceTemplate", purchaseInvoiceTemplateSchema);
export default PurchaseInvoiceTemplate;
