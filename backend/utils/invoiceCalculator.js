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
