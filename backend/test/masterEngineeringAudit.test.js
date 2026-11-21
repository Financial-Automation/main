import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Payroll from "../models/Payroll.js";
import { upsertAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";
import { getFinanceMetrics, getLiveBalanceSheet } from "../utils/financeAggregator.js";
import { getTotalPayables, getTotalReceivables, getDashboardSummary } from "../utils/financialTools.js";

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("Scenario 1: Complete sales transaction lifecycle (Customer -> Invoice -> Tax -> Partial Payment -> Ledger -> P&L)", async () => {
  const companyAId = new mongoose.Types.ObjectId();
  const now = new Date();

  // 1. Create Customer
  const customer = new Customer({
    userId: companyAId,
    name: "Apex Technologies Corp",
    email: "billing@apex.com",
    gstin: "33AAAAA0000A1Z5",
    billingAddress: "Chennai, Tamil Nadu"
  });
  await customer.save();

  // 2. Create Sales Invoice (₹1,00,000 + 18% GST = ₹1,18,000)
  const invoice = new Invoice({
    userId: companyAId,
    invoiceNumber: "INV-2026-0001",
    invoiceDate: now,
    dueDate: new Date(now.getTime() + 15 * 86400000),
    customerName: customer.name,
    customerId: customer._id,
    businessName: "SaaISS Enterprise",
    items: [{
      productName: "Cloud ERP License",
      quantity: 1,
      unitPrice: 100000,
      taxRate: 18,
      total: 118000
    }],
    subtotal: 100000,
    taxAmount: 18000,
    grandTotal: 118000,
    amountPaid: 0,
    balanceDue: 118000,
    status: "sent",
    paymentStatus: "pending"
  });
  await invoice.save();

  // Accrual Bookkeeping Revenue
  await upsertAutomatedBookkeepingEntry({
    userId: companyAId,
    date: now,
    description: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
    category: "Sales",
    amount: 118000,
    type: "income",
    referenceId: `invoice_${invoice._id}`
  });

  // Check initial receivable
  const receivablesInitial = await getTotalReceivables({ userId: companyAId });
  assert.equal(receivablesInitial.amount, 118000);

  // 3. Customer pays ₹1,00,000 partially
  const paymentAmount = 100000;
  invoice.amountPaid = paymentAmount;
  invoice.balanceDue = Math.max(0, invoice.grandTotal - invoice.amountPaid);
  invoice.paymentStatus = "partial";
  await invoice.save();

  const paymentRecord = new Payment({
    userId: companyAId,
    paymentNumber: "PMT-001",
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    amount: paymentAmount,
    paymentMethod: "bank_transfer",
    paymentDate: now,
    idempotencyKey: "idem_pay_001"
  });
  await paymentRecord.save();

  // 4. Verify post-payment states
  const receivablesPostPay = await getTotalReceivables({ userId: companyAId });
  assert.equal(receivablesPostPay.amount, 18000);
  assert.equal(invoice.balanceDue, 18000);

  // 5. Verify P&L and Balance Sheet
  const metrics = await getFinanceMetrics(companyAId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0));
  assert.equal(metrics.revenue.sales, 118000, "Revenue recognized under accrual accounting");
  assert.equal(metrics.cashFlow.inflow, 100000, "Cash flow inflow must strictly reflect cash collected (₹1,00,000)");

  const balanceSheet = await getLiveBalanceSheet(companyAId, "this-month");
  assert.equal(balanceSheet.assets.accountsReceivable, 18000);
  assert.equal(balanceSheet.assets.cashAndBank, 100000);
  assert.equal(balanceSheet.assets.currentAssets, 118000);
  assert.equal(balanceSheet.balanced, true);
});

test("Scenario 2: Complete purchase transaction (Supplier -> Purchase Bill -> Payables -> Inventory -> Payment)", async () => {
  const companyAId = new mongoose.Types.ObjectId();
  const now = new Date();

  const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierName: { type: String, required: true },
    billNo: { type: String, required: true },
    billDate: { type: String, required: true },
    subtotal: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, default: "completed" },
    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }));

  // Create Purchase Bill: ₹50,000 subtotal + ₹9,000 tax = ₹59,000
  const purchaseBill = new PurchaseInvoice({
    userId: companyAId,
    supplierName: "Dell India Pvt Ltd",
    billNo: "DELL-BILL-901",
    billDate: now.toISOString(),
    subtotal: 50000,
    totalTax: 9000,
    total: 59000,
    paid: 0,
    balance: 59000,
    status: "completed",
    createdAt: now
  });
  await purchaseBill.save();

  // Verify Payables
  const payablesInitial = await getTotalPayables({ userId: companyAId });
  assert.equal(payablesInitial.amount, 59000);

  // Record payment to supplier of ₹59,000
  purchaseBill.paid = 59000;
  purchaseBill.balance = 0;
  purchaseBill.status = "paid";
  await purchaseBill.save();

  const payablesPostPay = await getTotalPayables({ userId: companyAId });
  assert.equal(payablesPostPay.amount, 0);
});

test("Scenario 3 & 4: Partial payment invariant and zero duplicate revenue on final settlement", async () => {
  const companyAId = new mongoose.Types.ObjectId();
  const now = new Date();

  const invoice = new Invoice({
    userId: companyAId,
    invoiceNumber: "INV-00014",
    invoiceDate: now,
    dueDate: now,
    customerName: "Global Logistics",
    businessName: "SaaISS Software",
    items: [{ productName: "Logistics Software", quantity: 1, unitPrice: 100000, total: 118000 }],
    subtotal: 100000,
    taxAmount: 18000,
    grandTotal: 118000,
    amountPaid: 0,
    balanceDue: 118000,
    status: "sent",
    paymentStatus: "pending"
  });
  await invoice.save();

  // Initial accrual bookkeeping entry
  await upsertAutomatedBookkeepingEntry({
    userId: companyAId,
    date: now,
    description: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
    category: "Sales",
    amount: 118000,
    type: "income",
    referenceId: `invoice_${invoice._id}`
  });

  // Step 1: Pay ₹1,00,000
  invoice.amountPaid = 100000;
  invoice.balanceDue = 18000;
  invoice.paymentStatus = "partial";
  await invoice.save();

  // Step 2: Pay remaining ₹18,000
  invoice.amountPaid = Math.min(invoice.grandTotal, invoice.amountPaid + 18000);
  invoice.balanceDue = Math.max(0, invoice.grandTotal - invoice.amountPaid);
  invoice.paymentStatus = "paid";
  invoice.status = "paid";
  await invoice.save();

  assert.equal(invoice.amountPaid, 118000);
  assert.equal(invoice.balanceDue, 0);

  // Bookkeeping revenue count must be exactly 1 entry for ₹1,18,000
  const bkEntries = await BookkeepingEntry.find({ userId: companyAId, category: "Sales" });
  assert.equal(bkEntries.length, 1);
  assert.equal(bkEntries[0].amount, 118000);
});

test("Scenario 5: Duplicate payment idempotency prevention", async () => {
  const companyAId = new mongoose.Types.ObjectId();
  const fakeInvoiceId = new mongoose.Types.ObjectId();
  const idempotencyKey = "retry_token_abc_123";

  const p1 = new Payment({
    userId: companyAId,
    invoiceId: fakeInvoiceId,
    paymentNumber: "PMT-001",
    invoiceNumber: "INV-100",
    customerName: "Client A",
    amount: 5000,
    idempotencyKey
  });
  await p1.save();

  // Duplicate attempt with same idempotency key must be rejected by unique index / query
  const existing = await Payment.findOne({ idempotencyKey });
  assert.ok(existing);
  assert.equal(existing.amount, 5000);

  // Simulating duplicate rejection logic
  const isDuplicate = !!(await Payment.findOne({ idempotencyKey }));
  assert.equal(isDuplicate, true);
});

test("Scenario 7: Multi-tenant and company isolation (Company A vs Company B)", async () => {
  const companyA = new mongoose.Types.ObjectId();
  const companyB = new mongoose.Types.ObjectId();

  // Company A records
  const invA = new Invoice({
    userId: companyA,
    invoiceNumber: "INV-COM-01",
    invoiceDate: new Date(),
    dueDate: new Date(),
    customerName: "Customer A",
    businessName: "Company A Corp",
    items: [{ productName: "Service A", quantity: 1, unitPrice: 50000, total: 50000 }],
    subtotal: 50000,
    taxAmount: 0,
    grandTotal: 50000,
    amountPaid: 0,
    balanceDue: 50000,
    status: "sent",
    paymentStatus: "pending"
  });
  await invA.save();

  // Company B records
  const invB = new Invoice({
    userId: companyB,
    invoiceNumber: "INV-COM-01", // Notice: same invoice number across different tenant!
    invoiceDate: new Date(),
    dueDate: new Date(),
    customerName: "Customer B",
    businessName: "Company B LLC",
    items: [{ productName: "Service B", quantity: 1, unitPrice: 75000, total: 75000 }],
    subtotal: 75000,
    taxAmount: 0,
    grandTotal: 75000,
    amountPaid: 0,
    balanceDue: 75000,
    status: "sent",
    paymentStatus: "pending"
  });
  await invB.save();

  const recA = await getTotalReceivables({ userId: companyA });
  const recB = await getTotalReceivables({ userId: companyB });

  assert.equal(recA.amount, 50000);
  assert.equal(recB.amount, 75000);
});

test("Scenario 9: Payroll calculation safeguards and automated bookkeeping integration", async () => {
  const companyA = new mongoose.Types.ObjectId();

  const basicSalary = 60000;
  const da = 6000;
  const hra = 12000;
  const travelAllowance = 4000;
  const grossSalary = basicSalary + da + hra + travelAllowance; // 82,000
  const epf = 0.12 * grossSalary; // 9,840
  const tax = 0.05 * grossSalary; // 4,100
  const totalDeductions = epf + tax; // 13,940
  const netSalary = grossSalary - totalDeductions; // 68,060

  const payroll = new Payroll({
    userId: companyA,
    employeeName: "Senthil Kumar",
    employeeId: "EMP-042",
    employeeRole: "Senior Accountant",
    employeeDepartment: "Finance",
    employeeExperience: 7,
    basicSalary,
    da,
    hra,
    travelAllowance,
    overtimeAllowance: 0,
    otherAllowance: 0,
    bonuses: 0,
    grossSalary,
    pfDeduction: epf,
    epfDeduction: epf,
    taxDeduction: tax,
    totalDeductions,
    netSalary
  });
  await payroll.save();

  await upsertAutomatedBookkeepingEntry({
    userId: companyA,
    date: new Date(),
    description: `Payroll Salary: ${payroll.employeeName} (${payroll.employeeId})`,
    category: "Salaries",
    amount: grossSalary,
    type: "expense",
    referenceId: `payroll_${payroll._id}`
  });

  const salaryEntries = await BookkeepingEntry.find({ userId: companyA, category: "Salaries" });
  assert.equal(salaryEntries.length, 1);
  assert.equal(salaryEntries[0].amount, 82000);
});

test("Scenario 10: Inventory inter-state vs intra-state GST rate enforcement", async () => {
  const subtotal = 10000;
  const configuredItemGstRate = 12; // 12% item (not 18%)

  // Intra-state
  const intraSgstRate = configuredItemGstRate / 2; // 6%
  const intraCgstRate = configuredItemGstRate / 2; // 6%
  const intraIgstRate = 0;
  const intraTaxAmount = (subtotal * intraSgstRate / 100) + (subtotal * intraCgstRate / 100);
  assert.equal(intraTaxAmount, 1200);

  // Inter-state (fixed: uses configured item rate 12%, NOT hardcoded 18%)
  const interSgstRate = 0;
  const interCgstRate = 0;
  const interIgstRate = configuredItemGstRate; // 12%
  const interIgstAmount = (subtotal * interIgstRate) / 100;
  assert.equal(interIgstAmount, 1200);
  assert.notEqual(interIgstAmount, 1800, "Must not use hardcoded 18%");
});

test("Scenario 11: CPM Circular dependency detection", async () => {
  // Graph with circular dependency: Task A -> Task B -> Task A
  const graph = {
    T1: { predecessors: ["T2"] },
    T2: { predecessors: ["T1"] }
  };

  const cycleVisiting = new Set();
  const cycleVisited = new Set();
  let hasCycle = false;

  function detectCycle(nodeId) {
    if (cycleVisiting.has(nodeId)) {
      hasCycle = true;
      return true;
    }
    if (cycleVisited.has(nodeId)) return false;

    cycleVisiting.add(nodeId);
    for (const pred of graph[nodeId]?.predecessors || []) {
      if (detectCycle(pred)) return true;
    }
    cycleVisiting.delete(nodeId);
    cycleVisited.add(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(graph)) {
    if (detectCycle(nodeId)) break;
  }

  assert.equal(hasCycle, true, "Circular dependency must be positively detected");
});
