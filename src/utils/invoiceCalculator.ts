/**
 * Centralized Invoice Calculation Service (Frontend)
 * Exact calculation rules mirroring backend/utils/invoiceCalculator.js.
 */

export const roundDec = (val: number | string | undefined | null, decimals = 2): number => {
  const num = Number(val) || 0;
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

export const normalizeState = (state?: string): string => {
  return String(state || "").trim().toLowerCase();
};

export const determineIsInterState = (placeOfSupply?: string, sellerState = "Tamil Nadu"): boolean => {
  const customerNorm = normalizeState(placeOfSupply);
  const sellerNorm = normalizeState(sellerState);
  if (!customerNorm || !sellerNorm) return false;
  return customerNorm !== sellerNorm;
};

export interface RawLineItem {
  id?: string;
  inventoryItemId?: string;
  productId?: string;
  itemName?: string;
  productName?: string;
  itemCode?: string;
  codeType?: 'HSN' | 'SAC';
  hsnCode?: string;
  sacCode?: string;
  quantity?: number | string;
  unit?: string;
  pricePerUnit?: number | string;
  unitPrice?: number | string;
  priceWithTax?: boolean;
  discountPercent?: number | string;
  discountAmount?: number | string;
  discount?: number | string;
  taxPercent?: number | string;
  taxRate?: number | string;
  sku?: string;
  description?: string;
}

export interface CalculatedLineItem {
  id: string;
  inventoryItemId?: string;
  productId?: string;
  itemName: string;
  productName: string;
  itemCode: string;
  codeType: 'HSN' | 'SAC';
  hsnCode: string;
  sacCode: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  unitPrice: number;
  priceWithTax: boolean;
  discountPercent: number;
  discountAmount: number;
  discount: number;
  grossAmount: number;
  taxableAmount: number;
  taxPercent: number;
  taxRate: number;
  taxAmount: number;
  sgstRate: number;
  sgstAmount: number;
  cgstRate: number;
  cgstAmount: number;
  igstRate: number;
  igstAmount: number;
  isInterState: boolean;
  amount: number;
  total: number;
  sku?: string;
  description?: string;
  stockReserved?: boolean;
}

export const calculateLineItem = (item: RawLineItem, isInterState = false): CalculatedLineItem => {
  const quantity = Math.max(0, Number(item.quantity) || 0);
  const unitPrice = Math.max(0, Number(item.unitPrice ?? item.pricePerUnit) || 0);
  const taxRate = Math.max(0, Number(item.taxRate ?? item.taxPercent) || 0);
  const priceWithTax = Boolean(item.priceWithTax);
  const unit = String(item.unit || "Pcs").trim();

  // 1. Gross Line Amount
  const grossAmount = roundDec(quantity * unitPrice);

  // 2. Discount Calculation
  let discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  let discountAmount = 0;

  if (discountPercent > 0) {
    discountAmount = roundDec((grossAmount * discountPercent) / 100);
  } else if (Number(item.discount ?? item.discountAmount) > 0) {
    discountAmount = Math.min(grossAmount, roundDec(Number(item.discount ?? item.discountAmount)));
    if (grossAmount > 0) {
      discountPercent = roundDec((discountAmount / grossAmount) * 100);
    }
  }

  const netAfterDiscount = roundDec(Math.max(0, grossAmount - discountAmount));

  // 3. Taxable Amount & GST
  let taxableAmount = 0;
  let taxAmount = 0;
  let lineTotal = 0;

  if (taxRate <= 0) {
    taxableAmount = netAfterDiscount;
    taxAmount = 0;
    lineTotal = netAfterDiscount;
  } else if (priceWithTax) {
    // Tax-inclusive: netAfterDiscount already includes GST
    taxAmount = roundDec((netAfterDiscount * taxRate) / (100 + taxRate));
    taxableAmount = roundDec(netAfterDiscount - taxAmount);
    lineTotal = netAfterDiscount;
  } else {
    // Tax-exclusive: GST is added on top of taxableAmount
    taxableAmount = netAfterDiscount;
    taxAmount = roundDec((taxableAmount * taxRate) / 100);
    lineTotal = roundDec(taxableAmount + taxAmount);
  }

  // 4. CGST / SGST / IGST Breakdown
  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (taxRate > 0) {
    if (isInterState) {
      igstRate = taxRate;
      igstAmount = taxAmount;
    } else {
      cgstRate = roundDec(taxRate / 2);
      sgstRate = roundDec(taxRate / 2);
      cgstAmount = roundDec(taxAmount / 2);
      // Guarantee cgstAmount + sgstAmount === taxAmount
      sgstAmount = roundDec(taxAmount - cgstAmount);
    }
  }

  const name = item.itemName || item.productName || "Item";

  return {
    id: item.id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    inventoryItemId: item.inventoryItemId,
    productId: item.productId,
    itemName: name,
    productName: name,
    itemCode: item.itemCode || item.hsnCode || "",
    codeType: item.codeType || "HSN",
    hsnCode: item.hsnCode || "",
    sacCode: item.sacCode || "",
    quantity,
    unit: unit || "Pcs",
    pricePerUnit: unitPrice,
    unitPrice,
    priceWithTax,
    discountPercent,
    discountAmount,
    discount: discountAmount,
    grossAmount,
    taxableAmount,
    taxPercent: taxRate,
    taxRate,
    taxAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    isInterState,
    amount: lineTotal,
    total: lineTotal,
    sku: item.sku,
    description: item.description
  };
};

export interface InvoiceTotalsInput {
  items?: RawLineItem[];
  placeOfSupply?: string;
  sellerState?: string;
  shippingCharges?: number | string;
  packagingCharges?: number | string;
  freightCharges?: number | string;
  adjustment?: number | string;
  amountPaid?: number | string;
}

export interface InvoiceTotalsResult {
  items: CalculatedLineItem[];
  isInterState: boolean;
  totalGross: number;
  totalDiscount: number;
  subtotal: number; // Taxable Amount
  taxableAmount: number;
  taxAmount: number; // Total GST
  totalTax: number;
  cgst: number;
  totalCgst: number;
  sgst: number;
  totalSgst: number;
  igst: number;
  totalIgst: number;
  shippingCharges: number;
  packagingCharges: number;
  freightCharges: number;
  adjustment: number;
  otherCharges: number;
  grandTotal: number;
  total: number;
  amountPaid: number;
  paid: number;
  balanceDue: number;
  balance: number;
  paymentStatus: 'paid' | 'partial' | 'pending';
}

export const calculateInvoiceTotals = ({
  items = [],
  placeOfSupply = "",
  sellerState = "Tamil Nadu",
  shippingCharges = 0,
  packagingCharges = 0,
  freightCharges = 0,
  adjustment = 0,
  amountPaid = 0
}: InvoiceTotalsInput): InvoiceTotalsResult => {
  const isInterState = determineIsInterState(placeOfSupply, sellerState);

  const calculatedItems = (Array.isArray(items) ? items : []).map(item =>
    calculateLineItem(item, isInterState)
  );

  let totalGross = 0;
  let totalDiscount = 0;
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let taxAmount = 0;
  let itemsTotal = 0;

  for (const item of calculatedItems) {
    totalGross += item.grossAmount;
    totalDiscount += item.discountAmount;
    subtotal += item.taxableAmount;
    cgst += item.cgstAmount;
    sgst += item.sgstAmount;
    igst += item.igstAmount;
    taxAmount += item.taxAmount;
    itemsTotal += item.total;
  }

  totalGross = roundDec(totalGross);
  totalDiscount = roundDec(totalDiscount);
  subtotal = roundDec(subtotal);
  cgst = roundDec(cgst);
  sgst = roundDec(sgst);
  igst = roundDec(igst);
  taxAmount = roundDec(taxAmount);
  itemsTotal = roundDec(itemsTotal);

  const validShipping = roundDec(Math.max(0, Number(shippingCharges) || 0));
  const validPackaging = roundDec(Math.max(0, Number(packagingCharges) || 0));
  const validFreight = roundDec(Math.max(0, Number(freightCharges) || 0));
  const validAdjustment = roundDec(Number(adjustment) || 0);

  const otherCharges = roundDec(validShipping + validPackaging + validFreight + validAdjustment);

  // Grand Total = Total Taxable Amount + Total GST + Other Charges
  const grandTotal = roundDec(subtotal + taxAmount + otherCharges);

  const validatedPaid = roundDec(Math.min(grandTotal, Math.max(0, Number(amountPaid) || 0)));
  const balanceDue = roundDec(Math.max(0, grandTotal - validatedPaid));

  let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending';
  if (grandTotal > 0 && balanceDue === 0) {
    paymentStatus = 'paid';
  } else if (validatedPaid > 0) {
    paymentStatus = 'partial';
  }

  return {
    items: calculatedItems,
    isInterState,
    totalGross,
    totalDiscount,
    subtotal,
    taxableAmount: subtotal,
    taxAmount,
    totalTax: taxAmount,
    cgst,
    totalCgst: cgst,
    sgst,
    totalSgst: sgst,
    igst,
    totalIgst: igst,
    shippingCharges: validShipping,
    packagingCharges: validPackaging,
    freightCharges: validFreight,
    adjustment: validAdjustment,
    otherCharges,
    grandTotal,
    total: grandTotal,
    amountPaid: validatedPaid,
    paid: validatedPaid,
    balanceDue,
    balance: balanceDue,
    paymentStatus
  };
};
