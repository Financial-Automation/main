/**
 * Centralized Invoice Calculation Service (Backend)
 * Authoritative source of calculation rules for SaaISS Financial Accounting Software.
 */

export const roundDec = (val, decimals = 2) => {
  const num = Number(val) || 0;
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

/**
 * Normalizes state name for reliable comparison
 */
export const normalizeState = (state) => {
  return String(state || "").trim().toLowerCase();
};

/**
 * Determines whether a transaction is Inter-State (IGST) or Intra-State (CGST + SGST).
 */
export const determineIsInterState = (placeOfSupply, sellerState = "Tamil Nadu") => {
  const customerNorm = normalizeState(placeOfSupply);
  const sellerNorm = normalizeState(sellerState);
  if (!customerNorm || !sellerNorm) return false;
  return customerNorm !== sellerNorm;
};

/**
 * Calculates line amounts, discounts, taxable value, and GST breakdown for a single item.
 */
export const calculateLineItem = (item, isInterState = false) => {
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

  return {
    ...item,
    quantity,
    unit: unit || "Pcs",
    unitPrice,
    pricePerUnit: unitPrice,
    priceWithTax,
    discountPercent,
    discountAmount,
    discount: discountAmount,
    grossAmount,
    taxableAmount,
    taxRate,
    taxPercent: taxRate,
    taxAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    isInterState,
    total: lineTotal,
    amount: lineTotal
  };
};

/**
 * Calculates complete invoice totals from items, place of supply, and additional charges.
 */
export const calculateInvoiceTotals = ({
  items = [],
  placeOfSupply = "",
  sellerState = "Tamil Nadu",
  shippingCharges = 0,
  packagingCharges = 0,
  freightCharges = 0,
  adjustment = 0,
  amountPaid = 0
}) => {
  const isInterState = determineIsInterState(placeOfSupply, sellerState);

  const calculatedItems = (Array.isArray(items) ? items : []).map(item =>
    calculateLineItem(item, isInterState)
  );

  let totalGross = 0;
  let totalDiscount = 0;
  let subtotal = 0; // Total Taxable Amount
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

  // Grand Total = Total Taxable Amount (subtotal) + Total GST (taxAmount) + Other Charges
  const grandTotal = roundDec(subtotal + taxAmount + otherCharges);

  const validatedPaid = roundDec(Math.min(grandTotal, Math.max(0, Number(amountPaid) || 0)));
  const balanceDue = roundDec(Math.max(0, grandTotal - validatedPaid));

  let paymentStatus = "pending";
  if (grandTotal > 0 && balanceDue === 0) {
    paymentStatus = "paid";
  } else if (validatedPaid > 0) {
    paymentStatus = "partial";
  }

  return {
    items: calculatedItems,
    isInterState,
    totalGross,
    totalDiscount,
    subtotal, // Taxable amount
    taxableAmount: subtotal,
    taxAmount, // Total GST
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

/**
 * Validates and recalculates an invoice data object before persisting.
 */
export const validateAndRecalculateInvoice = (invoiceData, sellerState = "Tamil Nadu") => {
  const placeOfSupply = invoiceData.stateOfSupply || invoiceData.placeOfSupply || invoiceData.customerState || sellerState;
  const effectiveSellerState = invoiceData.businessState || invoiceData.sellerState || sellerState;

  const totals = calculateInvoiceTotals({
    items: invoiceData.items || [],
    placeOfSupply,
    sellerState: effectiveSellerState,
    shippingCharges: invoiceData.shippingCharges,
    packagingCharges: invoiceData.packagingCharges,
    freightCharges: invoiceData.freightCharges,
    adjustment: invoiceData.adjustment,
    amountPaid: invoiceData.amountPaid ?? invoiceData.paid
  });

  return {
    ...invoiceData,
    stateOfSupply: placeOfSupply,
    businessState: effectiveSellerState,
    items: totals.items.map(item => ({
      productId: item.productId || item.inventoryItemId || undefined,
      productName: item.productName || item.itemName || "Item",
      description: item.description || "",
      codeType: item.codeType || "HSN",
      hsnCode: item.hsnCode || "",
      sacCode: item.sacCode || "",
      unit: item.unit || "Pcs",
      priceWithTax: Boolean(item.priceWithTax),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discount: item.discountAmount,
      total: item.total
    })),
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    shippingCharges: totals.shippingCharges,
    packagingCharges: totals.packagingCharges,
    freightCharges: totals.freightCharges,
    adjustment: totals.adjustment,
    grandTotal: totals.grandTotal,
    amountPaid: totals.amountPaid,
    balanceDue: totals.balanceDue,
    paymentStatus: totals.paymentStatus,
    status: totals.balanceDue === 0 && totals.grandTotal > 0 ? "paid" : (invoiceData.status || "draft")
  };
};
