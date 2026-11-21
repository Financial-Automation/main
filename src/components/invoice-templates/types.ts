export type TemplateLayoutKey =
  | 'modern-indigo'
  | 'amber-gold'
  | 'emerald-corporate'
  | 'swiss-minimal'
  | 'midnight-executive'
  | 'modern-gradient'
  | 'editorial-luxury'
  | 'bold-creative'
  | 'eco-natural'
  | 'compact-business';

export interface TemplateDesign {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  fontFamily: string;
  fontSize: number;
  headingSize?: number;
  bodySize?: number;
  borderStyle: 'none' | 'light' | 'medium';
  cornerRadius: number;
}

export interface TemplateHeaderConfig {
  showLogo: boolean;
  logoPosition: 'left' | 'center' | 'right';
  logoSize: 'small' | 'medium' | 'large';
  logoUrl: string;
  showCompanyName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

export interface TemplateSellerConfig {
  showName: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showGSTIN: boolean;
  showAddress: boolean;
}

export interface TemplateCustomerConfig {
  showName: boolean;
  showGSTIN: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showBillingAddress: boolean;
  showShippingAddress: boolean;
  showPlaceOfSupply: boolean;
}

export interface TemplateInvoiceInfoConfig {
  showInvoiceNumber: boolean;
  showInvoiceDate: boolean;
  showDueDate: boolean;
  showPaymentTerms: boolean;
  showOrderNumber: boolean;
  showSalesperson: boolean;
  labels: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    paymentTerms: string;
    orderNumber: string;
    salespersonName: string;
  };
}

export interface TemplateItemsConfig {
  columns: string[];
  labels: {
    item: string;
    sku: string;
    description: string;
    hsn: string;
    quantity: string;
    rate: string;
    discount: string;
    tax: string;
    amount: string;
    [key: string]: string;
  };
}

export interface TemplateTaxConfig {
  showSummary: boolean;
  showCGST: boolean;
  showSGST: boolean;
  showIGST: boolean;
  showTaxableAmount: boolean;
  showTotalTax: boolean;
}

export interface TemplatePaymentConfig {
  showPaidAmount: boolean;
  showBalance: boolean;
  showPaymentMethod: boolean;
}

export interface TemplateSignatureConfig {
  show: boolean;
  name: string;
  designation: string;
  imageUrl: string;
}

export interface TemplateConfig {
  layout?: TemplateLayoutKey;
  header: TemplateHeaderConfig;
  seller: TemplateSellerConfig;
  customer: TemplateCustomerConfig;
  invoiceInfo: TemplateInvoiceInfoConfig;
  items: TemplateItemsConfig;
  tax: TemplateTaxConfig;
  payment: TemplatePaymentConfig;
  notes: {
    show: boolean;
    label: string;
    defaultText: string;
  };
  terms: {
    show: boolean;
    label: string;
    defaultText: string;
  };
  signature: TemplateSignatureConfig;
  footer: {
    show: boolean;
    text: string;
  };
  design: TemplateDesign;
  sectionsOrder: string[];
}

export interface TemplateDefinition {
  id: string;
  layoutKey: TemplateLayoutKey;
  name: string;
  tagline: string;
  description: string;
  category: 'Modern' | 'Corporate' | 'Minimal' | 'Luxury' | 'Creative' | 'Compact';
  isDefault?: boolean;
  config: TemplateConfig;
  accentColors: {
    primary: string;
    secondary: string;
    border: string;
    gradient?: string;
  };
}

export interface NormalizedInvoiceItem {
  id?: string;
  name: string;
  code?: string;
  sku?: string;
  description?: string;
  hsn?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

export interface NormalizedInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTerms?: string;
  orderNumber?: string;
  salespersonName?: string;
  eWayBillNo?: string;
  transactionType?: string;
  currency?: string;

  sellerName: string;
  sellerAddress?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerGSTIN?: string;

  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGSTIN?: string;
  stateOfSupply?: string;

  items: NormalizedInvoiceItem[];

  subtotal: number;
  totalDiscount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  shippingCharges: number;
  packagingCharges: number;
  freightCharges: number;
  adjustment: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  paymentMethod?: string;

  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  ifscCode?: string;
  authorisedSignature?: string;

  notes?: string;
  termsAndConditions?: string;
}

export const formatCurrency = (val: number | undefined | null, symbol = '₹'): string => {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const getTemplateLayoutKey = (template?: any): TemplateLayoutKey => {
  if (!template) return 'modern-indigo';

  // Explicit layout key in config or top level
  const explicit = template.config?.layout || template.layout;
  if (explicit && isValidLayoutKey(explicit)) {
    return explicit;
  }

  // Fallback match based on name, ID or design format
  const name = String(template?.name || template?._id || template?.id || '').toLowerCase();
  const format = String(template?.config?.design?.invoiceFormat || '').toLowerCase();
  if (name.includes('swiss') || name.includes('minimal') || format.includes('swiss')) return 'swiss-minimal';
  if (name.includes('midnight') || name.includes('executive') || format.includes('midnight')) return 'midnight-executive';
  if (name.includes('gradient') || format.includes('gradient')) return 'modern-gradient';
  if (name.includes('editorial') || name.includes('luxury') || format.includes('editorial')) return 'editorial-luxury';
  if (name.includes('bold') || name.includes('creative') || format.includes('bold')) return 'bold-creative';
  if (name.includes('eco') || name.includes('natural') || format.includes('eco')) return 'eco-natural';
  if (name.includes('compact') || name.includes('business') || name.includes('slate') || format.includes('stationery')) return 'compact-business';
  if (name.includes('amber') || name.includes('gold')) return 'amber-gold';
  if (name.includes('emerald') || name.includes('corporate') || name.includes('wholesale')) return 'emerald-corporate';
  if (name.includes('indigo') || name.includes('procurement') || name.includes('enterprise')) return 'modern-indigo';

  return 'modern-indigo';
};

const isValidLayoutKey = (key: string): key is TemplateLayoutKey => {
  return [
    'modern-indigo',
    'amber-gold',
    'emerald-corporate',
    'swiss-minimal',
    'midnight-executive',
    'modern-gradient',
    'editorial-luxury',
    'bold-creative',
    'eco-natural',
    'compact-business'
  ].includes(key);
};

export const normalizeInvoiceData = (raw: any): NormalizedInvoiceData => {
  if (!raw) {
    return {
      invoiceNumber: 'INV-001',
      invoiceDate: new Date().toISOString().split('T')[0],
      sellerName: 'COMPANY NAME',
      customerName: 'VALUED CUSTOMER',
      items: [],
      subtotal: 0,
      totalDiscount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      shippingCharges: 0,
      packagingCharges: 0,
      freightCharges: 0,
      adjustment: 0,
      grandTotal: 0,
      paidAmount: 0,
      balanceDue: 0
    };
  }

  // Handle items array
  const rawItems: any[] = Array.isArray(raw.items) ? raw.items : [];
  const normalizedItems: NormalizedInvoiceItem[] = rawItems.map((item, idx) => {
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const unitPrice = Number(item.pricePerUnit ?? item.unitPrice ?? item.price ?? item.rate ?? 0);
    const lineTotal = Number(item.amount ?? item.total ?? qty * unitPrice);
    const discPercent = Number(item.discountPercent ?? item.discount ?? 0);
    const discAmount = Number(item.discountAmount ?? (discPercent > 0 ? (qty * unitPrice * discPercent) / 100 : 0));
    const taxPct = Number(item.taxPercent ?? item.taxRate ?? (item.sgstRate || 0) + (item.cgstRate || 0) + (item.igstRate || 0));
    const taxAmt = Number(item.taxAmount ?? (item.sgstAmount || 0) + (item.cgstAmount || 0) + (item.igstAmount || 0));

    return {
      id: item.id || item._id || String(idx),
      name: item.itemName || item.productName || item.name || `Item ${idx + 1}`,
      code: item.itemCode || item.code || '',
      sku: item.sku || '',
      description: item.description || '',
      hsn: item.hsnCode || item.sacCode || item.hsn || '',
      quantity: qty,
      unit: item.unit || 'Pcs',
      unitPrice,
      discountPercent: discPercent,
      discountAmount: discAmount,
      taxPercent: taxPct,
      taxAmount: taxAmt,
      total: lineTotal
    };
  });

  const subtotal = Number(raw.subtotal ?? normalizedItems.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0));
  const totalDiscount = Number(
    raw.totalDiscount ?? normalizedItems.reduce((acc, i) => acc + (i.discountAmount || 0), 0)
  );
  const cgst = Number(raw.totalCgst ?? raw.cgst ?? 0);
  const sgst = Number(raw.totalSgst ?? raw.sgst ?? 0);
  const igst = Number(raw.totalIgst ?? raw.igst ?? 0);
  const totalTax = Number(raw.totalTax ?? raw.taxAmount ?? (cgst + sgst + igst));

  const shippingCharges = Number(raw.shippingCharges || 0);
  const packagingCharges = Number(raw.packagingCharges || 0);
  const freightCharges = Number(raw.freightCharges || 0);
  const adjustment = Number(raw.adjustment || 0);

  const grandTotal = Number(
    raw.total ?? raw.grandTotal ?? (subtotal - totalDiscount + totalTax + shippingCharges + packagingCharges + freightCharges + adjustment)
  );
  const paidAmount = Number(raw.paid ?? raw.amountPaid ?? 0);
  const balanceDue = Number(raw.balance ?? raw.balanceDue ?? Math.max(0, grandTotal - paidAmount));

  return {
    invoiceNumber: raw.billNo || raw.invoiceNo || raw.invoiceNumber || 'INV-001',
    invoiceDate: raw.billDate ? String(raw.billDate) : (raw.invoiceDate ? String(raw.invoiceDate) : new Date().toLocaleDateString('en-GB')),
    dueDate: raw.dueDate ? String(raw.dueDate) : undefined,
    paymentTerms: raw.paymentTerms || undefined,
    orderNumber: raw.orderNumber || undefined,
    salespersonName: raw.salespersonName || undefined,
    eWayBillNo: raw.eWayBillNo || undefined,
    transactionType: raw.customerType || raw.transactionType || 'B2C',
    currency: raw.currency || 'INR',

    sellerName: raw.supplierName || raw.sellerName || raw.businessName || 'SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED',
    sellerAddress: raw.sellerAddress || raw.businessAddress || '3/124 Main Road, Andal Nagar, Trichy, Tamil Nadu - 620001',
    sellerPhone: raw.phone || raw.sellerPhone || raw.businessPhone || '+91 94432 10101',
    sellerEmail: raw.sellerEmail || raw.businessEmail || 'billing@finsmart.com',
    sellerGSTIN: raw.gstin || raw.sellerGSTIN || raw.businessGSTIN || '33ANDAL8271A1Z5',

    customerName: raw.customerName || raw.partyName || 'Valued Customer',
    customerAddress: raw.customerAddress || undefined,
    customerPhone: raw.customerPhone || raw.phoneNo || undefined,
    customerEmail: raw.customerEmail || undefined,
    customerGSTIN: raw.customerGstin || raw.customerGSTIN || undefined,
    stateOfSupply: raw.stateOfSupply || undefined,

    items: normalizedItems,

    subtotal,
    totalDiscount,
    cgst,
    sgst,
    igst,
    totalTax,
    shippingCharges,
    packagingCharges,
    freightCharges,
    adjustment,
    grandTotal,
    paidAmount,
    balanceDue,
    paymentMethod: raw.saleType || raw.paymentMethod || 'cash',

    bankName: raw.bankName || 'HDFC Bank',
    accountType: raw.accountType || 'Current',
    accountNumber: raw.accountNumber || '50200088991122',
    ifscCode: raw.ifscCode || 'HDFC0001234',
    authorisedSignature: raw.authorisedSignature || undefined,

    notes: raw.notes || undefined,
    termsAndConditions: raw.termsAndConditions || undefined
  };
};
