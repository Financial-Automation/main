import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLineItem,
  calculateInvoiceTotals,
  determineIsInterState,
  validateAndRecalculateInvoice
} from "../utils/invoiceCalculator.js";

test("Invoice Calculator — Section 5 Mandatory Test: 'Invoice Model Design' 10 Nos @ ₹10,000, 18% Intra-State GST", () => {
  const item = calculateLineItem({
    productName: "Invoice Model Design",
    quantity: 10,
    unit: "Nos",
    unitPrice: 10000,
    taxRate: 18,
    priceWithTax: false,
    discountPercent: 0
  }, false);

  assert.equal(item.quantity, 10, "Quantity must be 10");
  assert.equal(item.unit, "Nos", "Unit must be 'Nos'");
  assert.equal(item.unitPrice, 10000, "Unit price must be ₹10,000");
  assert.equal(item.grossAmount, 100000, "Line amount before discount must be ₹1,00,000");
  assert.equal(item.discountAmount, 0, "Discount must be ₹0");
  assert.equal(item.taxableAmount, 100000, "Taxable amount must be ₹1,00,000");
  assert.equal(item.cgstRate, 9, "CGST rate must be 9%");
  assert.equal(item.cgstAmount, 9000, "CGST must be ₹9,000");
  assert.equal(item.sgstRate, 9, "SGST rate must be 9%");
  assert.equal(item.sgstAmount, 9000, "SGST must be ₹9,000");
  assert.equal(item.igstAmount, 0, "IGST must be ₹0 for intra-state");
  assert.equal(item.taxAmount, 18000, "Total GST must be ₹18,000");
  assert.equal(item.total, 118000, "Line total must be ₹1,18,000");

  const totals = calculateInvoiceTotals({
    items: [item],
    placeOfSupply: "Tamil Nadu",
    sellerState: "Tamil Nadu"
  });

  assert.equal(totals.subtotal, 100000, "Invoice subtotal must be ₹1,00,000");
  assert.equal(totals.cgst, 9000, "Invoice CGST must be ₹9,000");
  assert.equal(totals.sgst, 9000, "Invoice SGST must be ₹9,000");
  assert.equal(totals.igst, 0, "Invoice IGST must be ₹0");
  assert.equal(totals.taxAmount, 18000, "Invoice total GST must be ₹18,000");
  assert.equal(totals.grandTotal, 118000, "Invoice Grand Total must be ₹1,18,000");
});

test("Invoice Calculator — Section 5 Inter-State: 'Invoice Model Design' 10 Nos @ ₹10,000, 18% IGST", () => {
  const item = calculateLineItem({
    productName: "Invoice Model Design",
    quantity: 10,
    unit: "Nos",
    unitPrice: 10000,
    taxRate: 18,
    priceWithTax: false
  }, true);

  assert.equal(item.taxableAmount, 100000);
  assert.equal(item.igstRate, 18);
  assert.equal(item.igstAmount, 18000);
  assert.equal(item.cgstAmount, 0);
  assert.equal(item.sgstAmount, 0);
  assert.equal(item.total, 118000);

  const totals = calculateInvoiceTotals({
    items: [item],
    placeOfSupply: "Karnataka",
    sellerState: "Tamil Nadu"
  });

  assert.equal(totals.isInterState, true);
  assert.equal(totals.igst, 18000);
  assert.equal(totals.cgst, 0);
  assert.equal(totals.sgst, 0);
  assert.equal(totals.grandTotal, 118000);
});

test("Invoice Calculator — Verification of Client Reported Value ₹2,00,600 (Tax-Exclusive 10 Nos @ ₹17,000, 18% GST)", () => {
  const item = calculateLineItem({
    productName: "Design Work",
    quantity: 10,
    unit: "Nos",
    unitPrice: 17000,
    taxRate: 18,
    priceWithTax: false
  }, false);

  assert.equal(item.taxableAmount, 170000, "Taxable base must be ₹1,70,000");
  assert.equal(item.cgstAmount, 15300, "CGST on ₹1,70,000 @ 9% is ₹15,300 (NOT ₹15,254)");
  assert.equal(item.sgstAmount, 15300, "SGST on ₹1,70,000 @ 9% is ₹15,300 (NOT ₹15,254)");
  assert.equal(item.taxAmount, 30600, "Total tax is ₹30,600");
  assert.equal(item.total, 200600, "Grand total for ₹1,70,000 exclusive + 18% tax is ₹2,00,600");

  const totals = calculateInvoiceTotals({ items: [item], placeOfSupply: "Tamil Nadu", sellerState: "Tamil Nadu" });
  assert.equal(totals.grandTotal, 200600);
  assert.equal(totals.cgst, 15300);
  assert.equal(totals.sgst, 15300);
});

test("Invoice Calculator — Verification of Client Reported Value ₹15,254 (Tax-Inclusive ₹2,00,000 Base @ 18% GST)", () => {
  const item = calculateLineItem({
    productName: "Design Work Tax Inclusive",
    quantity: 10,
    unit: "Nos",
    unitPrice: 20000, // 10 * 20,000 = 2,00,000 gross inclusive
    taxRate: 18,
    priceWithTax: true
  }, false);

  assert.equal(item.grossAmount, 200000);
  assert.equal(item.taxableAmount, 169491.53, "Taxable amount for ₹2,00,000 inclusive @ 18% must be ₹1,69,491.53");
  assert.equal(item.cgstAmount, 15254.24, "CGST @ 9% is ₹15,254.24 (matches client reported ₹15,254)");
  assert.equal(item.sgstAmount, 15254.23, "SGST @ 9% is ₹15,254.23 (matches client reported ₹15,254)");
  assert.equal(item.taxAmount, 30508.47, "Total GST is ₹30,508.47");
  assert.equal(item.total, 200000, "Total inclusive amount must remain ₹2,00,000");

  const totals = calculateInvoiceTotals({ items: [item], placeOfSupply: "Tamil Nadu", sellerState: "Tamil Nadu" });
  assert.equal(totals.subtotal, 169491.53, "Subtotal must accurately reflect taxable amount");
  assert.equal(totals.taxAmount, 30508.47);
  assert.equal(totals.grandTotal, 200000, "Grand total must be ₹2,00,000 (NOT ₹2,00,600)");
  assert.equal(totals.subtotal + totals.taxAmount, totals.grandTotal, "Subtotal + Tax must equal Grand Total");
});

test("Invoice Calculator — Multiple items with mixed GST rates and item discounts", () => {
  const itemA = calculateLineItem({
    productName: "Item 18%",
    quantity: 5,
    unitPrice: 2000,
    discountPercent: 10, // 10,000 - 1,000 = 9,000 taxable
    taxRate: 18,
    priceWithTax: false
  }, false);

  const itemB = calculateLineItem({
    productName: "Item 5%",
    quantity: 2,
    unitPrice: 5000,
    discount: 500, // 10,000 - 500 = 9,500 taxable
    taxRate: 5,
    priceWithTax: false
  }, false);

  assert.equal(itemA.taxableAmount, 9000);
  assert.equal(itemA.cgstAmount, 810);
  assert.equal(itemA.sgstAmount, 810);
  assert.equal(itemA.total, 10620);

  assert.equal(itemB.taxableAmount, 9500);
  assert.equal(itemB.cgstAmount, 237.5);
  assert.equal(itemB.sgstAmount, 237.5);
  assert.equal(itemB.total, 9975);

  const totals = calculateInvoiceTotals({
    items: [itemA, itemB],
    shippingCharges: 250,
    placeOfSupply: "Tamil Nadu",
    sellerState: "Tamil Nadu"
  });

  assert.equal(totals.subtotal, 18500, "Subtotal = 9,000 + 9,500 = 18,500");
  assert.equal(totals.cgst, 1047.5);
  assert.equal(totals.sgst, 1047.5);
  assert.equal(totals.taxAmount, 2095);
  assert.equal(totals.otherCharges, 250);
  assert.equal(totals.grandTotal, 20845, "Grand Total = 18,500 + 2,095 + 250 = 20,845");
});

test("Invoice Calculator — Single item with quantity 1", () => {
  const item = calculateLineItem({
    productName: "Single Unit",
    quantity: 1,
    unitPrice: 500,
    taxRate: 18,
    priceWithTax: false
  }, false);

  assert.equal(item.quantity, 1);
  assert.equal(item.taxableAmount, 500);
  assert.equal(item.cgstAmount, 45);
  assert.equal(item.sgstAmount, 45);
  assert.equal(item.total, 590);
});

test("Invoice Calculator — Fractional quantities and decimal unit prices", () => {
  const item = calculateLineItem({
    productName: "Bulk Cable",
    quantity: 12.5,
    unit: "Mtr",
    unitPrice: 87.45,
    taxRate: 18,
    priceWithTax: false
  }, false);

  // 12.5 * 87.45 = 1093.125 -> 1093.13
  assert.equal(item.grossAmount, 1093.13);
  assert.equal(item.taxableAmount, 1093.13);
  // 1093.13 * 0.18 = 196.7634 -> 196.76
  assert.equal(item.taxAmount, 196.76);
  assert.equal(item.cgstAmount, 98.38);
  assert.equal(item.sgstAmount, 98.38);
  assert.equal(item.total, 1289.89);
});

test("Invoice Calculator — validateAndRecalculateInvoice updates all fields accurately", () => {
  const rawInvoice = {
    invoiceNumber: "INV-2026-TEST",
    stateOfSupply: "Karnataka",
    businessState: "Tamil Nadu",
    items: [{
      productName: "Consulting",
      quantity: 10,
      unitPrice: 5000,
      taxRate: 18,
      priceWithTax: false
    }],
    shippingCharges: 1000,
    amountPaid: 20000,
    subtotal: 99999, // Intentional mismatch
    grandTotal: 99999 // Intentional mismatch
  };

  const validated = validateAndRecalculateInvoice(rawInvoice, "Tamil Nadu");

  assert.equal(validated.subtotal, 50000, "Subtotal must be recalculated to 50,000");
  assert.equal(validated.igst, 9000, "Inter-state IGST must be 9,000");
  assert.equal(validated.cgst, 0, "CGST must be 0 for inter-state");
  assert.equal(validated.sgst, 0, "SGST must be 0 for inter-state");
  assert.equal(validated.taxAmount, 9000, "Tax amount must be 9,000");
  assert.equal(validated.grandTotal, 60000, "Grand total must be 50,000 + 9,000 + 1,000 = 60,000");
  assert.equal(validated.amountPaid, 20000);
  assert.equal(validated.balanceDue, 40000, "Balance due must be 60,000 - 20,000 = 40,000");
  assert.equal(validated.paymentStatus, "partial");
});

test("Invoice Receivables Logic — Credit sales, partial payments ('mithi amount'), and credit card distinction", () => {
  const isCreditMethod = (method) => {
    return String(method || '').trim().toLowerCase() === 'credit';
  };

  const getPendingReceivable = (inv) => {
    const isCredit = isCreditMethod(inv.paymentMethod || inv.saleType);
    const total = Number(inv.grandTotal || inv.total || 0);
    const paid = Number(inv.paid !== undefined ? inv.paid : (inv.amountPaid || 0));
    let bal = (inv.balanceDue !== undefined && inv.balanceDue !== null && !isNaN(Number(inv.balanceDue)))
      ? Number(inv.balanceDue)
      : ((inv.balance !== undefined && inv.balance !== null && !isNaN(Number(inv.balance)))
        ? Number(inv.balance)
        : Math.max(0, total - paid));

    if (!isCredit && (inv.status === 'paid' || inv.paymentStatus === 'paid') && bal <= 0) return 0;
    if (bal <= 0 && paid >= total && total > 0) return 0;
    if (isCredit && paid === 0) return total;
    if (paid > 0) return Math.max(0, total - paid);
    return Math.max(0, bal);
  };

  // Case 1: Credit sale for ₹10,000 with ₹0 paid -> full ₹10,000 is pending receivable
  const creditInvUnpaid = {
    paymentMethod: 'credit',
    grandTotal: 10000,
    amountPaid: 0,
    balanceDue: 10000,
    status: 'sent'
  };
  assert.equal(getPendingReceivable(creditInvUnpaid), 10000, "Unpaid credit invoice must yield full grandTotal as receivable");

  // Case 2: Credit sale for ₹10,000 with half amount paid (₹5,000 paid) -> remaining ₹5,000 ('mithi amount') is pending
  const creditInvHalfPaid = {
    paymentMethod: 'credit',
    grandTotal: 10000,
    amountPaid: 5000,
    balanceDue: 5000,
    status: 'partial'
  };
  assert.equal(getPendingReceivable(creditInvHalfPaid), 5000, "Half-paid credit invoice must yield remaining ₹5,000 ('mithi amount') as receivable");

  // Case 3: Fully paid credit sale (₹10,000 paid of ₹10,000) -> ₹0 receivable
  const creditInvFullyPaid = {
    paymentMethod: 'credit',
    grandTotal: 10000,
    amountPaid: 10000,
    balanceDue: 0,
    status: 'paid'
  };
  assert.equal(getPendingReceivable(creditInvFullyPaid), 0, "Fully paid invoice must yield ₹0 receivable");

  // Case 4: Credit card payment is NOT customer credit (settled transaction)
  assert.equal(isCreditMethod('credit_card'), false, "credit_card must NOT be classified as customer credit");
  assert.equal(isCreditMethod('card'), false, "card must NOT be classified as customer credit");
  assert.equal(isCreditMethod('credit'), true, "credit must be classified as customer credit");

  const cardInvPaid = {
    paymentMethod: 'credit_card',
    grandTotal: 5000,
    amountPaid: 5000,
    balanceDue: 0,
    status: 'paid'
  };
  assert.equal(getPendingReceivable(cardInvPaid), 0, "Credit card settled invoice must yield ₹0 receivable");
});

test("Bookkeeping Income Invariant — Credit pota or pay panatha amount bookkeeping la kata kudathu", () => {
  // Simulates Bookkeeping income calculation rule:
  const getBookkeepingIncomeForInvoice = (inv) => {
    const isCredit = String(inv.paymentMethod || inv.saleType || '').trim().toLowerCase() === 'credit';
    const paid = Number(inv.amountPaid !== undefined ? inv.amountPaid : (inv.paid || 0));

    // If credit with 0 paid, or unpaid invoice (0 paid): NO bookkeeping income entry
    if (isCredit && paid <= 0) return 0;
    if (paid <= 0 && inv.status !== 'paid' && inv.paymentStatus !== 'paid') return 0;

    // Only actual paid/received amount is income in bookkeeping
    return Math.max(0, paid);
  };

  // 1. Credit invoice with ₹0 paid -> Bookkeeping income MUST be 0
  const creditUnpaid = {
    invoiceNumber: "INV-CREDIT-01",
    grandTotal: 50000,
    paymentMethod: "credit",
    amountPaid: 0,
    balanceDue: 50000,
    status: "sent"
  };
  assert.equal(getBookkeepingIncomeForInvoice(creditUnpaid), 0, "Unpaid credit sale must NOT show in bookkeeping income");

  // 2. Unpaid standard invoice with ₹0 paid -> Bookkeeping income MUST be 0
  const cashUnpaid = {
    invoiceNumber: "INV-UNPAID-01",
    grandTotal: 25000,
    paymentMethod: "cash",
    amountPaid: 0,
    balanceDue: 25000,
    status: "sent",
    paymentStatus: "pending"
  };
  assert.equal(getBookkeepingIncomeForInvoice(cashUnpaid), 0, "Unpaid invoice must NOT show in bookkeeping income");

  // 3. Partial payment (half paid: ₹20,000 paid out of ₹40,000) -> Bookkeeping income MUST be ₹20,000 (NOT ₹40,000)
  const partialInvoice = {
    invoiceNumber: "INV-PARTIAL-01",
    grandTotal: 40000,
    paymentMethod: "credit",
    amountPaid: 20000,
    balanceDue: 20000,
    status: "partial",
    paymentStatus: "partial"
  };
  assert.equal(getBookkeepingIncomeForInvoice(partialInvoice), 20000, "Partial payment must only record actual paid amount in bookkeeping income");

  // 4. Fully paid invoice (₹40,000 of ₹40,000) -> Bookkeeping income MUST be ₹40,000
  const fullyPaidInvoice = {
    invoiceNumber: "INV-PAID-01",
    grandTotal: 40000,
    paymentMethod: "upi",
    amountPaid: 40000,
    balanceDue: 0,
    status: "paid",
    paymentStatus: "paid"
  };
  assert.equal(getBookkeepingIncomeForInvoice(fullyPaidInvoice), 40000, "Fully paid invoice records full collected income in bookkeeping");
});
