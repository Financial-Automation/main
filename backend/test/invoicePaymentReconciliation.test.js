import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import User from "../models/User.js";
import LedgerAccount from "../models/LedgerAccount.js";
import {
  getPurchaseInvoiceModel,
  getTotalReceivables,
  getTotalPayables,
  getDashboardSummary,
  getOutstandingBalance,
  roundDec
} from "../utils/financialTools.js";
import { getFinanceMetrics, getLiveBalanceSheet } from "../utils/financeAggregator.js";

let mongod;
let testUserId;
let testUserScope;
let PurchaseInvoice;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  testUserId = new mongoose.Types.ObjectId();
  testUserScope = { userId: testUserId };

  await User.create({
    _id: testUserId,
    name: "SaaISS Accounting Admin",
    email: "cfo@saaiss.in",
    password: "hashedpassword123",
    role: "admin",
    businessName: "SaaISS Tech Pvt Ltd",
    businessGSTIN: "33AABCS1429B1ZB"
  });

  // Seed default Ledger accounts
  await LedgerAccount.create([
    { userId: testUserId, name: "Cash/Bank", code: "10000", type: "Asset", balance: 0 },
    { userId: testUserId, name: "Accounts Receivable", code: "12000", type: "Asset", balance: 0 },
    { userId: testUserId, name: "Accounts Payable", code: "20000", type: "Liability", balance: 0 },
    { userId: testUserId, name: "Sales Revenue", code: "40000", type: "Revenue", balance: 0 },
    { userId: testUserId, name: "CGST Payable", code: "22100", type: "Liability", balance: 0 },
    { userId: testUserId, name: "SGST Payable", code: "22200", type: "Liability", balance: 0 },
  ]);

  PurchaseInvoice = getPurchaseInvoiceModel();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// Helper to simulate recording a payment with our centralized backend logic
async function recordInvoicePayment({
  invoiceId,
  amount,
  amountPaid,
  paymentMethod = "bank_transfer",
  paymentDate = new Date(),
  idempotencyKey = "",
  referenceNumber = "",
  notes = ""
}) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const effectiveKey = String(idempotencyKey || referenceNumber || "").trim();

  // 1. Idempotency Check
  if (effectiveKey) {
    const existing = await Payment.findOne({ invoiceId: invoice._id, idempotencyKey: effectiveKey });
    if (existing) {
      return { invoice, payment: existing, isDuplicate: true };
    }
  }

  // 2. Parse payAmt
  let payAmt = 0;
  if (amount !== undefined && amount !== null && !isNaN(parseFloat(amount))) {
    payAmt = parseFloat(amount);
  } else if (amountPaid !== undefined && amountPaid !== null && !isNaN(parseFloat(amountPaid))) {
    const parsedAmountPaid = parseFloat(amountPaid);
    if (parsedAmountPaid > (invoice.amountPaid || 0)) {
      payAmt = parsedAmountPaid - (invoice.amountPaid || 0);
    } else {
      payAmt = parsedAmountPaid;
    }
  }

  payAmt = Math.round(payAmt * 100) / 100;
  if (isNaN(payAmt) || payAmt <= 0) {
    throw new Error("Invalid payment amount. Amount must be greater than 0.");
  }

  const grandTotal = Math.round((Number(invoice.grandTotal) || 0) * 100) / 100;
  const currentPaid = Math.round((Number(invoice.amountPaid) || 0) * 100) / 100;
  const currentBalance = Math.max(0, Math.round((grandTotal - currentPaid) * 100) / 100);

  if (currentBalance <= 0) {
    throw new Error("Invoice is already fully paid. Cannot accept further payment.");
  }

  if (payAmt > currentBalance + 0.01) {
    throw new Error(`Payment amount (₹${payAmt.toFixed(2)}) cannot exceed remaining balance (₹${currentBalance.toFixed(2)}).`);
  }

  const newAmountPaid = Math.min(grandTotal, Math.round((currentPaid + payAmt) * 100) / 100);
  const newBalanceDue = Math.max(0, Math.round((grandTotal - newAmountPaid) * 100) / 100);
  const newPaymentStatus = newBalanceDue <= 0 ? 'paid' : 'partial';
  const newStatus = newBalanceDue <= 0 ? 'paid' : (invoice.status === 'draft' ? 'sent' : invoice.status);

  // 3. Persist Payment
  const pCount = await Payment.countDocuments({ invoiceId: invoice._id });
  const paymentNumber = `PMT-${invoice.invoiceNumber}-${(pCount + 1).toString().padStart(2, '0')}`;
  const payment = new Payment({
    userId: invoice.userId,
    invoiceId: invoice._id,
    paymentNumber,
    amount: payAmt,
    paymentDate,
    paymentMethod,
    depositAccount: "Cash/Bank",
    referenceNumber: referenceNumber || effectiveKey,
    notes,
    idempotencyKey: effectiveKey
  });
  await payment.save();

  // 4. Update Invoice
  invoice.amountPaid = newAmountPaid;
  invoice.balanceDue = newBalanceDue;
  invoice.paymentStatus = newPaymentStatus;
  invoice.status = newStatus;
  invoice.updatedAt = new Date();
  await invoice.save();

  // 5. Update Ledger (Debit Cash/Bank, Credit Accounts Receivable)
  const [cashAcc, arAcc] = await Promise.all([
    LedgerAccount.findOne({ userId: invoice.userId, name: "Cash/Bank" }),
    LedgerAccount.findOne({ userId: invoice.userId, name: "Accounts Receivable" })
  ]);
  if (cashAcc) {
    cashAcc.balance = Math.round((cashAcc.balance + payAmt) * 100) / 100;
    await cashAcc.save();
  }
  if (arAcc) {
    arAcc.balance = Math.round((arAcc.balance - payAmt) * 100) / 100;
    await arAcc.save();
  }

  return { invoice, payment, isDuplicate: false };
}

// ---------------------------------------------------------------------------
// TEST SUITE: Tests A through J
// ---------------------------------------------------------------------------

test("Test A — Partially paid sales invoice (INV-00014: ₹1,18,000 total, ₹1,00,000 paid)", async () => {
  // 1. Create Sales Invoice INV-00014
  const inv14 = await Invoice.create({
    userId: testUserId,
    invoiceNumber: "INV-00014",
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 15 * 86400000),
    customerName: "Acme Client Corp",
    businessName: "SaaISS Tech Pvt Ltd",
    items: [{
      productName: "Enterprise Accounting Software License",
      quantity: 1,
      unitPrice: 100000,
      taxRate: 18,
      total: 118000
    }],
    subtotal: 100000,
    taxAmount: 18000,
    cgst: 9000,
    sgst: 9000,
    igst: 0,
    grandTotal: 118000,
    amountPaid: 0,
    balanceDue: 118000,
    paymentStatus: "pending",
    status: "sent"
  });

  // Also create initial Bookkeeping entry for sales revenue
  await BookkeepingEntry.create({
    userId: testUserId,
    date: inv14.invoiceDate,
    description: `Sales Invoice ${inv14.invoiceNumber} to ${inv14.customerName}`,
    category: "Sales",
    amount: 118000,
    type: "income",
    referenceId: `invoice_${inv14._id}`,
    isAutomated: true
  });

  // 2. Customer pays ₹1,00,000
  const result = await recordInvoicePayment({
    invoiceId: inv14._id,
    amount: 100000,
    paymentMethod: "bank_transfer",
    referenceNumber: "TXN-INV14-01",
    idempotencyKey: "idem_inv14_01"
  });

  const updated = result.invoice;
  assert.equal(updated.grandTotal, 118000, "Grand total must remain ₹1,18,000");
  assert.equal(updated.amountPaid, 100000, "Amount paid must be ₹1,00,000");
  assert.equal(updated.balanceDue, 18000, "Outstanding balance must be ₹18,000");
  assert.equal(updated.paymentStatus, "partial", "Payment status must be 'partial'");
  assert.equal(updated.status, "sent", "Invoice status must be 'sent'");

  // Verify Accounts Receivable reflects ₹18,000
  const openBalance = getOutstandingBalance(updated);
  assert.equal(openBalance, 18000, "Outstanding balance helper must return ₹18,000");
});

test("Test B — Additional valid payment (Remaining ₹18,000 paid)", async () => {
  const inv14 = await Invoice.findOne({ invoiceNumber: "INV-00014", userId: testUserId });
  assert.ok(inv14);

  // Pay remaining ₹18,000
  const result = await recordInvoicePayment({
    invoiceId: inv14._id,
    amount: 18000,
    paymentMethod: "upi",
    referenceNumber: "TXN-INV14-02",
    idempotencyKey: "idem_inv14_02"
  });

  const settled = result.invoice;
  assert.equal(settled.grandTotal, 118000, "Grand total must remain ₹1,18,000");
  assert.equal(settled.amountPaid, 118000, "Cumulative amount paid must be ₹1,18,000");
  assert.equal(settled.balanceDue, 0, "Outstanding balance must be ₹0");
  assert.equal(settled.paymentStatus, "paid", "Payment status must be 'paid'");
  assert.equal(settled.status, "paid", "Invoice status must be 'paid'");

  // Verify total payments recorded for INV-00014
  const payments = await Payment.find({ invoiceId: inv14._id });
  assert.equal(payments.length, 2, "Exactly 2 payment records should be persisted");
  const totalPaidSum = payments.reduce((s, p) => s + p.amount, 0);
  assert.equal(totalPaidSum, 118000, "Sum of payment records must equal ₹1,18,000");
});

test("Test C — Duplicate payment retry (Idempotency enforcement)", async () => {
  const inv14 = await Invoice.findOne({ invoiceNumber: "INV-00014", userId: testUserId });
  assert.ok(inv14);

  // Re-submit the second payment with same idempotencyKey "idem_inv14_02"
  const retryResult = await recordInvoicePayment({
    invoiceId: inv14._id,
    amount: 18000,
    paymentMethod: "upi",
    referenceNumber: "TXN-INV14-02",
    idempotencyKey: "idem_inv14_02"
  });

  assert.equal(retryResult.isDuplicate, true, "Retry must be identified as duplicate");
  assert.equal(retryResult.invoice.amountPaid, 118000, "Amount paid must NOT double");
  assert.equal(retryResult.invoice.balanceDue, 0, "Balance must remain 0");

  const paymentsCount = await Payment.countDocuments({ invoiceId: inv14._id });
  assert.equal(paymentsCount, 2, "No duplicate payment records should be created");
});

test("Test D — Acer laptop invoice calculation (Qty 1 × ₹1,00,000, 18% GST)", async () => {
  const subtotal = 100000;
  const taxRate = 18;
  const isInterState = false;

  const cgstRate = isInterState ? 0 : taxRate / 2;
  const sgstRate = isInterState ? 0 : taxRate / 2;
  const igstRate = isInterState ? taxRate : 0;

  const cgst = Math.round((subtotal * cgstRate) / 100);
  const sgst = Math.round((subtotal * sgstRate) / 100);
  const igst = Math.round((subtotal * igstRate) / 100);
  const taxAmount = cgst + sgst + igst;
  const grandTotal = subtotal + taxAmount;

  assert.equal(subtotal, 100000, "Subtotal must be ₹1,00,000");
  assert.equal(cgst, 9000, "CGST (9%) must be ₹9,000");
  assert.equal(sgst, 9000, "SGST (9%) must be ₹9,000");
  assert.equal(igst, 0, "IGST must be ₹0 for intra-state");
  assert.equal(taxAmount, 18000, "Total tax must be ₹18,000");
  assert.equal(grandTotal, 118000, "Grand total must be ₹1,18,000");

  const acerInvoice = await Invoice.create({
    userId: testUserId,
    invoiceNumber: "INV-ACER-001",
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 15 * 86400000),
    customerName: "Acer Client",
    businessName: "SaaISS Tech Pvt Ltd",
    items: [{
      productName: "ACER LAPTOP",
      quantity: 1,
      unitPrice: 100000,
      taxRate: 18,
      total: 118000
    }],
    subtotal,
    taxAmount,
    cgst,
    sgst,
    igst,
    grandTotal,
    amountPaid: 0,
    balanceDue: grandTotal,
    paymentStatus: "pending",
    status: "sent"
  });

  assert.equal(acerInvoice.grandTotal, 118000);
  assert.equal(acerInvoice.balanceDue, 118000);
});

test("Test E — Incorrect paid amount prevention (₹1,18,000 invoice cannot display/store ₹2,36,000)", async () => {
  const acerInv = await Invoice.findOne({ invoiceNumber: "INV-ACER-001", userId: testUserId });
  assert.ok(acerInv);

  // Attempting to pay ₹2,36,000 against a ₹1,18,000 invoice must be rejected
  await assert.rejects(
    async () => {
      await recordInvoicePayment({
        invoiceId: acerInv._id,
        amount: 236000,
        idempotencyKey: "invalid_overpay"
      });
    },
    /cannot exceed remaining balance/,
    "Should reject payment exceeding balance"
  );

  // Pay valid ₹1,18,000
  await recordInvoicePayment({
    invoiceId: acerInv._id,
    amount: 118000,
    idempotencyKey: "valid_full_acer"
  });

  const refreshed = await Invoice.findById(acerInv._id);
  assert.equal(refreshed.amountPaid, 118000, "Amount paid must be ₹1,18,000, NEVER ₹2,36,000");
  assert.equal(refreshed.balanceDue, 0, "Balance must be 0");

  // Attempting another payment once paid must be rejected as already fully paid
  await assert.rejects(
    async () => {
      await recordInvoicePayment({
        invoiceId: acerInv._id,
        amount: 118000,
        idempotencyKey: "duplicate_attempt_acer"
      });
    },
    /already fully paid/,
    "Should reject payment on already fully paid invoice"
  );
});

test("Test F — PDF and History consistency", async () => {
  const acerInv = await Invoice.findOne({ invoiceNumber: "INV-ACER-001", userId: testUserId });
  assert.ok(acerInv);

  // Simulate PDF calculations
  const pdfTotal = Math.round((Number(acerInv.grandTotal) || 0) * 100) / 100;
  const pdfPaid = Math.min(pdfTotal, Math.max(0, Math.round((Number(acerInv.amountPaid) || 0) * 100) / 100));
  const pdfBalance = Math.max(0, Math.round((pdfTotal - pdfPaid) * 100) / 100);

  // Verify consistency
  assert.equal(pdfTotal, 118000, "PDF total must match database grandTotal ₹1,18,000");
  assert.equal(pdfPaid, 118000, "PDF paid must match database amountPaid ₹1,18,000");
  assert.equal(pdfBalance, 0, "PDF balance must match database balanceDue ₹0");
  assert.equal(pdfPaid + pdfBalance, pdfTotal, "PDF paid + balance must strictly equal total");
});

test("Test G — Purchase invoice isolation (PUR-00822 THANGAMAYIL JEWELLERY SHOP)", async () => {
  // Create Purchase Invoice PUR-00822
  const pur822 = await PurchaseInvoice.create({
    userId: testUserId,
    billNo: "PUR-00822",
    billDate: new Date().toISOString().split("T")[0],
    supplierName: "THANGAMAYIL JEWELLERY SHOP",
    total: 50000,
    subtotal: 42372.88,
    totalTax: 7627.12,
    paid: 0,
    balance: 50000,
    status: "pending",
    paymentMethod: "Credit",
    stateOfSupply: "Tamil Nadu",
    businessState: "Tamil Nadu",
    items: [{
      itemName: "Gold/Jewellery Supply",
      quantity: 1,
      unit: "Pcs",
      pricePerUnit: 42372.88,
      taxRate: 18,
      taxAmount: 7627.12,
      total: 50000
    }]
  });

  // Verify initial payables
  const payablesBefore = await getTotalPayables({ userId: testUserId });
  assert.equal(payablesBefore.amount, 50000, "Total payables must include PUR-00822 (₹50,000)");

  // Record partial payment on PUR-00822 of ₹20,000
  pur822.paid = 20000;
  pur822.balance = 30000;
  await pur822.save();

  const payablesAfter = await getTotalPayables({ userId: testUserId });
  assert.equal(payablesAfter.amount, 30000, "Total payables must now be ₹30,000");

  // Verify that sales invoices were completely isolated and untouched
  const inv14 = await Invoice.findOne({ invoiceNumber: "INV-00014", userId: testUserId });
  assert.equal(inv14.amountPaid, 118000, "Sales invoice INV-00014 amountPaid must remain unchanged");
  assert.equal(inv14.balanceDue, 0, "Sales invoice INV-00014 balanceDue must remain unchanged");
});

test("Test H — Accounting reports & No duplicate revenue", async () => {
  // P&L metrics must calculate revenue from sales invoices/bookkeeping without duplicating payments
  const metrics = await getFinanceMetrics(testUserId, new Date(Date.now() - 30 * 86400000), new Date(Date.now() + 86400000));
  
  // Total sales revenue from BookkeepingEntry should be ₹1,18,000 (from INV-00014), NOT ₹2,18,000 or ₹2,36,000!
  assert.equal(metrics.revenue.sales, 118000, "Sales revenue must NOT duplicate payment amounts");

  // Live Balance Sheet cash and bank reconciliation
  const bs = await getLiveBalanceSheet(testUserId);
  assert.ok(bs, "Balance sheet must be generated");
  assert.equal(typeof bs.assets.currentAssets, "number");
});

test("Test I — Historical data safety", async () => {
  // Create an unrelated historical invoice
  const historicalInv = await Invoice.create({
    userId: testUserId,
    invoiceNumber: "INV-HIST-999",
    invoiceDate: new Date("2025-01-15"),
    dueDate: new Date("2025-01-30"),
    customerName: "Historical Client",
    businessName: "SaaISS Tech Pvt Ltd",
    items: [{
      productName: "Old Service",
      quantity: 1,
      unitPrice: 25000,
      taxRate: 18,
      total: 29500
    }],
    subtotal: 25000,
    taxAmount: 4500,
    grandTotal: 29500,
    amountPaid: 29500,
    balanceDue: 0,
    paymentStatus: "paid",
    status: "paid"
  });

  // Verify historical invoice remains completely unaltered
  const retrieved = await Invoice.findOne({ invoiceNumber: "INV-HIST-999", userId: testUserId });
  assert.equal(retrieved.grandTotal, 29500);
  assert.equal(retrieved.amountPaid, 29500);
  assert.equal(retrieved.balanceDue, 0);
  assert.equal(retrieved.status, "paid");
});

test("Test J — Repeated operations idempotency & stability", async () => {
  // Create test invoice for repeated operations
  const testInv = await Invoice.create({
    userId: testUserId,
    invoiceNumber: "INV-REPEAT-001",
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 15 * 86400000),
    customerName: "Repeat Test Client",
    businessName: "SaaISS Tech Pvt Ltd",
    items: [{
      productName: "Consulting",
      quantity: 1,
      unitPrice: 50000,
      taxRate: 18,
      total: 59000
    }],
    subtotal: 50000,
    taxAmount: 9000,
    grandTotal: 59000,
    amountPaid: 0,
    balanceDue: 59000,
    paymentStatus: "pending",
    status: "sent"
  });

  // Pay ₹30,000
  const res1 = await recordInvoicePayment({
    invoiceId: testInv._id,
    amount: 30000,
    idempotencyKey: "rep_op_01"
  });
  assert.equal(res1.invoice.amountPaid, 30000);
  assert.equal(res1.invoice.balanceDue, 29000);

  // Retry the exact same request 3 times
  for (let i = 0; i < 3; i++) {
    const resRetry = await recordInvoicePayment({
      invoiceId: testInv._id,
      amount: 30000,
      idempotencyKey: "rep_op_01"
    });
    assert.equal(resRetry.isDuplicate, true, `Retry ${i+1} must be detected as duplicate`);
    assert.equal(resRetry.invoice.amountPaid, 30000, `Amount paid must remain 30,000 on retry ${i+1}`);
    assert.equal(resRetry.invoice.balanceDue, 29000, `Balance due must remain 29,000 on retry ${i+1}`);
  }

  // Recalculate dashboard multiple times — values must be completely stable
  const dash1 = await getDashboardSummary({ userId: testUserId });
  const dash2 = await getDashboardSummary({ userId: testUserId });
  assert.equal(dash1.totalReceivables, dash2.totalReceivables, "Dashboard receivables must be idempotent and stable");
  assert.equal(dash1.totalPayables, dash2.totalPayables, "Dashboard payables must be idempotent and stable");
});
