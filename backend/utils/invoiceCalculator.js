/**
 * Centralized Invoice Calculation & Validation Service (Backend)
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
  amountPaid = undefined,
  isCredit = false
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

  let validatedPaid = 0;
  if (amountPaid !== undefined && amountPaid !== null && !isNaN(Number(amountPaid))) {
    validatedPaid = roundDec(Math.min(grandTotal, Math.max(0, Number(amountPaid))));
  } else if (!isCredit && grandTotal > 0) {
    validatedPaid = grandTotal;
  }
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
  const method = String(invoiceData.paymentMethod || invoiceData.saleType || "cash").trim().toLowerCase();
  const isCredit = method === "credit";

  let rawPaid = invoiceData.amountPaid !== undefined ? invoiceData.amountPaid : invoiceData.paid;
  if (!isCredit && (rawPaid === undefined || rawPaid === null || (Number(rawPaid) === 0 && (Number(invoiceData.balanceDue) === 0 || invoiceData.status === 'paid')))) {
    rawPaid = undefined;
  }

  const totals = calculateInvoiceTotals({
    items: invoiceData.items || [],
    placeOfSupply,
    sellerState: effectiveSellerState,
    shippingCharges: invoiceData.shippingCharges,
    packagingCharges: invoiceData.packagingCharges,
    freightCharges: invoiceData.freightCharges,
    adjustment: invoiceData.adjustment,
    amountPaid: rawPaid,
    isCredit
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

/**
 * Authoritative Server-Side Invoice Calculation & Validation Utility
 * Enforces calculation integrity and input validation for the Invoice module.
 */
export function calculateAndValidateInvoice(invoiceData) {
  const items = invoiceData.items;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      valid: false,
      statusCode: 400,
      error: "Invoice must contain at least one line item"
    };
  }

  let calculatedSubtotal = 0;
  let calculatedTaxAmount = 0;
  let calculatedDiscountAmount = 0;
  let calculatedSgst = 0;
  let calculatedCgst = 0;
  let calculatedIgst = 0;

  const processedItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const taxRate = Number(item.taxRate || 0);
    const discount = Number(item.discount || 0);
    const priceWithTax = Boolean(item.priceWithTax);

    // Validate quantity & unitPrice (DEF-INV-05)
    if (isNaN(qty) || !isFinite(qty) || qty < 0) {
      return {
        valid: false,
        statusCode: 400,
        error: `Invalid quantity '${item.quantity}' for line item ${i + 1} ('${item.productName || 'Item'}'). Quantity cannot be negative.`
      };
    }

    if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0) {
      return {
        valid: false,
        statusCode: 400,
        error: `Invalid unit price '${item.unitPrice}' for line item ${i + 1} ('${item.productName || 'Item'}'). Unit price cannot be negative.`
      };
    }

    if (isNaN(taxRate) || !isFinite(taxRate) || taxRate < 0) {
      return {
        valid: false,
        statusCode: 400,
        error: `Invalid tax rate '${item.taxRate}' for line item ${i + 1}. Tax rate cannot be negative.`
      };
    }

    if (isNaN(discount) || !isFinite(discount) || discount < 0) {
      return {
        valid: false,
        statusCode: 400,
        error: `Invalid discount '${item.discount}' for line item ${i + 1}. Discount cannot be negative.`
      };
    }

    // Line item financial calculation
    const baseAmount = qty * unitPrice;
    let itemDiscountAmt = 0;
    if (discount > 0) {
      if (discount <= 100) {
        itemDiscountAmt = baseAmount * (discount / 100);
      } else {
        itemDiscountAmt = Math.min(discount, baseAmount);
      }
    }

    let taxableAmount = 0;
    let itemTax = 0;
    let itemTotal = 0;

    if (priceWithTax && taxRate > 0) {
      // Unit price includes tax
      const netGross = baseAmount - itemDiscountAmt;
      taxableAmount = netGross / (1 + taxRate / 100);
      itemTax = netGross - taxableAmount;
      itemTotal = netGross;
    } else {
      // Unit price excludes tax
      taxableAmount = baseAmount - itemDiscountAmt;
      itemTax = taxableAmount * (taxRate / 100);
      itemTotal = taxableAmount + itemTax;
    }

    // Rounding to 2 decimal places per line item
    taxableAmount = Math.round(taxableAmount * 100) / 100;
    itemTax = Math.round(itemTax * 100) / 100;
    itemDiscountAmt = Math.round(itemDiscountAmt * 100) / 100;
    itemTotal = Math.round(itemTotal * 100) / 100;

    calculatedSubtotal += taxableAmount;
    calculatedTaxAmount += itemTax;
    calculatedDiscountAmount += itemDiscountAmt;

    processedItems.push({
      ...item,
      quantity: qty,
      unitPrice: unitPrice,
      taxRate: taxRate,
      discount: discount,
      total: itemTotal
    });
  }

  // Additional charges
  const shippingCharges = Math.max(0, Number(invoiceData.shippingCharges || 0));
  const packagingCharges = Math.max(0, Number(invoiceData.packagingCharges || 0));
  const freightCharges = Math.max(0, Number(invoiceData.freightCharges || 0));
  const adjustment = Number(invoiceData.adjustment || 0);

  calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
  calculatedTaxAmount = Math.round(calculatedTaxAmount * 100) / 100;
  calculatedDiscountAmount = Math.round(calculatedDiscountAmount * 100) / 100;

  // Split SGST/CGST or IGST
  if (invoiceData.transactionType === 'B2B' && invoiceData.stateOfSupply && invoiceData.businessState && invoiceData.stateOfSupply !== invoiceData.businessState) {
    calculatedIgst = calculatedTaxAmount;
  } else {
    calculatedSgst = Math.round((calculatedTaxAmount / 2) * 100) / 100;
    calculatedCgst = Math.round((calculatedTaxAmount - calculatedSgst) * 100) / 100;
  }

  const calculatedGrandTotal = Math.max(0, Math.round((calculatedSubtotal + calculatedTaxAmount + shippingCharges + packagingCharges + freightCharges + adjustment) * 100) / 100);

  // Validate client submitted totals if provided (DEF-INV-03)
  const TOLERANCE = 1.0; // Allow max 1.0 currency unit tolerance for rounding differences
  if (invoiceData.grandTotal !== undefined && invoiceData.grandTotal !== null) {
    const submittedGrandTotal = Number(invoiceData.grandTotal);
    if (isNaN(submittedGrandTotal) || Math.abs(submittedGrandTotal - calculatedGrandTotal) > TOLERANCE) {
      return {
        valid: false,
        statusCode: 400,
        error: `Server calculation mismatch: Submitted grand total (${submittedGrandTotal}) does not match server-calculated grand total (${calculatedGrandTotal}).`
      };
    }
  }

  if (invoiceData.subtotal !== undefined && invoiceData.subtotal !== null) {
    const submittedSubtotal = Number(invoiceData.subtotal);
    if (isNaN(submittedSubtotal) || Math.abs(submittedSubtotal - calculatedSubtotal) > TOLERANCE) {
      return {
        valid: false,
        statusCode: 400,
        error: `Server calculation mismatch: Submitted subtotal (${submittedSubtotal}) does not match server-calculated subtotal (${calculatedSubtotal}).`
      };
    }
  }

  if (invoiceData.taxAmount !== undefined && invoiceData.taxAmount !== null) {
    const submittedTaxAmount = Number(invoiceData.taxAmount);
    if (isNaN(submittedTaxAmount) || Math.abs(submittedTaxAmount - calculatedTaxAmount) > TOLERANCE) {
      return {
        valid: false,
        statusCode: 400,
        error: `Server calculation mismatch: Submitted tax amount (${submittedTaxAmount}) does not match server-calculated tax amount (${calculatedTaxAmount}).`
      };
    }
  }

  const amountPaid = Math.max(0, Number(invoiceData.amountPaid || 0));
  const calculatedBalanceDue = Math.max(0, Math.round((calculatedGrandTotal - amountPaid) * 100) / 100);

  return {
    valid: true,
    data: {
      items: processedItems,
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      discountAmount: calculatedDiscountAmount,
      shippingCharges,
      packagingCharges,
      freightCharges,
      adjustment,
      grandTotal: calculatedGrandTotal,
      balanceDue: calculatedBalanceDue,
      sgst: calculatedSgst,
      cgst: calculatedCgst,
      igst: calculatedIgst
    }
  };
}
