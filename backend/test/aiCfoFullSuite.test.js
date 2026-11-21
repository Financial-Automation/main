import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

import Invoice from "../models/Invoice.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import User from "../models/User.js";
import {
  getPurchaseInvoiceModel,
  getInventoryItemModel,
  getPayrollModel,
  getBankReconciliationModel,
  getFraudTransactionModel,
  getFraudRuleModel,
  getCivilProjectModel,
  getDashboardSummary,
  getTotalPayables,
  getTotalReceivables,
  getProfitAndLoss,
  getExpenseAnalysis,
  getBalanceSheetData,
  getCashFlowData,
  getCashFlowForecastData,
  getFinancialRatiosData,
  getInvoiceDetails,
  getInventoryValuationData,
  getGstManagementData,
  getPayrollData,
  getBankReconciliationData,
  getFraudDetectionData,
  getCivilProjectsData,
  roundDec,
  formatINR,
} from "../utils/financialTools.js";
import {
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer,
} from "../utils/financialAssistant.js";

let mongod;
let userA_Id;
let userB_Id;
let userA_InstoreId;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // 1. Create Users
  userA_Id = new mongoose.Types.ObjectId();
  userB_Id = new mongoose.Types.ObjectId();
  userA_InstoreId = new mongoose.Types.ObjectId();

  await User.create([
    {
      _id: userA_Id,
      email: "cfo_admin@companya.com",
      password: "hashedpassword",
      name: "Alpha Corp Admin",
      role: "admin",
      subscriptionStatus: "active",
      subscriptionPlan: "monthly",
    },
    {
      _id: userA_InstoreId,
      email: "staff@companya.com",
      password: "hashedpassword",
      name: "Alpha Corp Staff",
      role: "instore",
      subscriptionStatus: "active",
      subscriptionPlan: "monthly",
    },
    {
      _id: userB_Id,
      email: "owner@companyb.com",
      password: "hashedpassword",
      name: "Beta Ltd Owner",
      role: "admin",
      subscriptionStatus: "active",
      subscriptionPlan: "monthly",
    },
  ]);

  const now = new Date();
  const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 10);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const pastDueDate = new Date(now.getFullYear(), now.getMonth(), 2);
  const futureDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);

  // 2. Seed Sales Invoices for Company A
  // Total Sales Invoices:
  // INV-A01: GrandTotal 100,000, Paid 20,000, Balance 80,000 (Open, Overdue)
  // INV-A02: GrandTotal 50,000, Paid 0, Balance 50,000 (Open, Future Due)
  // INV-A03: GrandTotal 30,000, Paid 30,000, Balance 0 (Paid)
  // Expected Receivables = 80,000 + 50,000 = 130,000
  await Invoice.create([
    {
      userId: userA_Id,
      businessName: "Alpha Corp",
      invoiceNumber: "INV-A01",
      customerName: "Acme Enterprises",
      customerEmail: "acme@example.com",
      invoiceDate: thisMonthDate,
      dueDate: pastDueDate,
      subtotal: 90000,
      taxAmount: 10000,
      grandTotal: 100000,
      amountPaid: 20000,
      balanceDue: 80000,
      status: "sent",
      paymentStatus: "partial",
      items: [{ productName: "Consulting", quantity: 1, unitPrice: 90000, total: 90000 }],
    },
    {
      userId: userA_Id,
      businessName: "Alpha Corp",
      invoiceNumber: "INV-A02",
      customerName: "Global Logistics",
      invoiceDate: thisMonthDate,
      dueDate: futureDueDate,
      subtotal: 45000,
      taxAmount: 5000,
      grandTotal: 50000,
      amountPaid: 0,
      balanceDue: 50000,
      status: "sent",
      paymentStatus: "pending",
      items: [{ productName: "Software Setup", quantity: 1, unitPrice: 45000, total: 45000 }],
    },
    {
      userId: userA_Id,
      businessName: "Alpha Corp",
      invoiceNumber: "INV-A03",
      customerName: "Quick Mart",
      invoiceDate: thisMonthDate,
      dueDate: pastDueDate,
      subtotal: 30000,
      taxAmount: 0,
      grandTotal: 30000,
      amountPaid: 30000,
      balanceDue: 0,
      status: "paid",
      paymentStatus: "paid",
    },
  ]);

  // 3. Seed Purchase Invoices for Company A
  // Total Purchase Bills:
  // BILL-P01: Total 120,000, Paid 40,000, Balance 80,000, Supplier: Steel Corp (Open, Overdue)
  // BILL-P02: Total 70,000, Paid 0, Balance 70,000, Supplier: Apex Cement (Open, Future Due)
  // BILL-P03: Total 15,000, Paid 15,000, Balance 0, Supplier: Office Depot (Paid)
  // Expected Payables = 80,000 + 70,000 = 150,000
  const PurchaseInvoice = getPurchaseInvoiceModel();
  await PurchaseInvoice.create([
    {
      userId: userA_Id,
      billNo: "BILL-P01",
      supplierName: "Steel Corp",
      billDate: thisMonthDate.toISOString().split("T")[0],
      createdAt: thisMonthDate,
      dueDate: pastDueDate,
      total: 120000,
      paid: 40000,
      balance: 80000,
      status: "active",
      items: [{ itemName: "TMT Steel", quantity: 2, pricePerUnit: 60000, amount: 120000 }],
    },
    {
      userId: userA_Id,
      billNo: "BILL-P02",
      supplierName: "Apex Cement",
      billDate: thisMonthDate.toISOString().split("T")[0],
      createdAt: thisMonthDate,
      dueDate: futureDueDate,
      total: 70000,
      paid: 0,
      balance: 70000,
      status: "active",
      items: [{ itemName: "Portland Cement", quantity: 100, pricePerUnit: 700, amount: 70000 }],
    },
    {
      userId: userA_Id,
      billNo: "BILL-P03",
      supplierName: "Office Depot",
      billDate: thisMonthDate.toISOString().split("T")[0],
      createdAt: thisMonthDate,
      dueDate: pastDueDate,
      total: 15000,
      paid: 15000,
      balance: 0,
      status: "paid",
    },
  ]);

  // 4. Seed Bookkeeping Entries for Company A
  // Current month:
  // Income: 250,000
  // Expenses: 90,000 (Salaries: 50,000, Rent: 30,000, Utilities: 10,000)
  // Net Profit = 250,000 - 90,000 = 160,000
  // Previous month:
  // Expenses: 60,000 (Salaries: 40,000, Rent: 20,000) -> expense increased by 30,000!
  await BookkeepingEntry.create([
    {
      userId: userA_Id,
      type: "income",
      category: "Sales",
      amount: 250000,
      date: thisMonthDate,
      description: "Client contract billing",
    },
    {
      userId: userA_Id,
      type: "expense",
      category: "Salaries",
      amount: 50000,
      date: thisMonthDate,
      description: "Payroll disbursements",
    },
    {
      userId: userA_Id,
      type: "expense",
      category: "Rent",
      amount: 30000,
      date: thisMonthDate,
      description: "Office rent",
    },
    {
      userId: userA_Id,
      type: "expense",
      category: "Utilities",
      amount: 10000,
      date: thisMonthDate,
      description: "Electricity and internet",
    },
    {
      userId: userA_Id,
      type: "expense",
      category: "Salaries",
      amount: 40000,
      date: prevMonthDate,
      description: "Previous month payroll",
    },
    {
      userId: userA_Id,
      type: "expense",
      category: "Rent",
      amount: 20000,
      date: prevMonthDate,
      description: "Previous month rent",
    },
  ]);

  // 5. Seed Inventory
  const InventoryItem = getInventoryItemModel();
  await InventoryItem.create([
    {
      userId: userA_Id,
      itemName: "Hydraulic Pump",
      sku: "HP-100",
      quantity: 5, // Below reorder level (<10)
      price: 15000,
      costPrice: 10000,
    },
    {
      userId: userA_Id,
      itemName: "Safety Helmets",
      sku: "SH-500",
      quantity: 50,
      price: 800,
      costPrice: 500,
    },
  ]);

  // 6. Seed Payroll
  const Payroll = getPayrollModel();
  await Payroll.create([
    {
      userId: userA_Id,
      employeeName: "John Doe",
      employeeId: "EMP-001",
      employeeRole: "Senior Engineer",
      employeeDepartment: "Engineering",
      basicSalary: 40000,
      da: 5000,
      hra: 5000,
      travelAllowance: 2000,
      otherAllowance: 0,
      bonuses: 3000,
      grossSalary: 55000,
      pfDeduction: 4000,
      epfDeduction: 1000,
      taxDeduction: 2000,
      totalDeductions: 7000,
      netSalary: 48000,
    },
  ]);

  // 7. Seed Company B Data for Tenant Isolation Verification
  await Invoice.create({
    userId: userB_Id,
    businessName: "Beta Ltd",
    invoiceNumber: "INV-B99",
    customerName: "Secret Client B",
    invoiceDate: thisMonthDate,
    dueDate: futureDueDate,
    subtotal: 999999,
    taxAmount: 0,
    grandTotal: 999999,
    amountPaid: 0,
    balanceDue: 999999,
    status: "sent",
    paymentStatus: "pending",
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ============================================================================
// TEST 1: Ask "What is my Total Payables?" & Verify Exact Dashboard Match
// ============================================================================
test("1. Total Payables retrieves exact authoritative dashboard amount (₹1,50,000.00)", async () => {
  const dashboard = await getDashboardSummary({ userId: userA_Id, period: "this-month" });
  assert.equal(dashboard.totalPayables, 150000, "Dashboard Total Payables must equal 150,000");

  const question = "What is my Total Payables?";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "total_payables");

  const result = await queryFinancialTool({ userId: userA_Id, intent, period: "this-month", question });
  assert.equal(result.amount, dashboard.totalPayables, "Assistant amount must match dashboard amount exactly");

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Your current Total Payables are \*\*₹1,50,000\.00\*\*/, "Answer must contain exact formatted payables amount");
  assert.match(answer, /Would you like me to show the supplier-wise breakdown or the overdue payments\?/, "Answer must propose the standard follow-up");
});

// ============================================================================
// TEST 2: Ask "What is my Total Receivables?" & Verify Exact Dashboard Match
// ============================================================================
test("2. Total Receivables retrieves exact authoritative dashboard amount (₹1,30,000.00)", async () => {
  const dashboard = await getDashboardSummary({ userId: userA_Id, period: "this-month" });
  assert.equal(dashboard.totalReceivables, 130000, "Dashboard Total Receivables must equal 130,000 (80k + 50k)");

  const question = "What is my Total Receivables?";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "total_receivables");

  const result = await queryFinancialTool({ userId: userA_Id, intent, period: "this-month", question });
  assert.equal(result.amount, dashboard.totalReceivables, "Assistant amount must match dashboard amount exactly");

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Your current Total Receivables are \*\*₹1,30,000\.00\*\*/, "Answer must contain exact formatted receivables amount");
});

// ============================================================================
// TEST 3: Ask "What is my Net Profit this month?" & Compare with P&L Module
// ============================================================================
test("3. Net Profit retrieves exact Profit and Loss value (₹1,60,000.00)", async () => {
  const dashboard = await getDashboardSummary({ userId: userA_Id, period: "this-month" });
  const plData = await getProfitAndLoss({ userId: userA_Id, period: "this-month" });

  assert.equal(plData.netProfit, 160000, "P&L Net profit should be 160,000 (250k - 90k)");
  assert.equal(dashboard.netProfit, plData.netProfit, "Dashboard Net profit must match P&L Net profit");

  const question = "What is my Net Profit this month?";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "profit_and_loss");

  const result = await queryFinancialTool({ userId: userA_Id, intent, period: "this-month", question });
  assert.equal(result.netProfit, 160000);
  assert.equal(result.isProfitable, true);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Net Profit:\*\* \*\*₹1,60,000\.00\*\*/);
  assert.match(answer, /PROFITABLE ✅/);
});

// ============================================================================
// TEST 4: Ask for an invoice's outstanding balance & verify payment records
// ============================================================================
test("4. Specific Invoice balance lookup retrieves correct balance and line items", async () => {
  const question = "What is the balance of invoice INV-A01?";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "invoice_details");

  const result = await queryFinancialTool({ userId: userA_Id, intent, question });
  assert.equal(result.found, true);
  assert.equal(result.invoiceNumber, "INV-A01");
  assert.equal(result.grandTotal, 100000);
  assert.equal(result.amountPaid, 20000);
  assert.equal(result.balanceDue, 80000);
  assert.equal(result.paymentStatus, "PARTIAL");

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Balance Due:\*\* \*\*₹80,000\.00\*\*/);
});

// ============================================================================
// TEST 5: Apply a payment, then ask for the same invoice balance again
// ============================================================================
test("5. Applying payment immediately updates outstanding balance dynamically", async () => {
  const invoice = await Invoice.findOne({ invoiceNumber: "INV-A01", userId: userA_Id });
  assert.ok(invoice);

  // Apply ₹30,000 payment
  invoice.amountPaid += 30000;
  invoice.balanceDue = Math.max(0, invoice.grandTotal - invoice.amountPaid);
  invoice.paymentStatus = invoice.balanceDue === 0 ? "paid" : "partial";
  await invoice.save();

  const question = "What is the balance of invoice INV-A01?";
  const result = await queryFinancialTool({ userId: userA_Id, intent: "invoice_details", question });
  assert.equal(result.amountPaid, 50000);
  assert.equal(result.balanceDue, 50000);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Amount Paid:\*\* \*\*₹50,000\.00\*\*/);
  assert.match(answer, /Balance Due:\*\* \*\*₹50,000\.00\*\*/);
});

// ============================================================================
// TEST 6: Ask for overdue invoices & verify due dates and outstanding balances
// ============================================================================
test("6. Overdue invoices filter returns correct items and amounts", async () => {
  const question = "Show overdue customer invoices";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "outstanding_sales_invoices");

  const result = await queryFinancialTool({ userId: userA_Id, intent, period: "this-month", question });
  assert.ok(result.overdueInvoiceCount >= 1);
  assert.equal(result.overdueInvoices[0].invoiceNumber, "INV-A01");
  assert.equal(result.overdueInvoices[0].balance, 50000); // Updated in Test 5

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /INV-A01/);
  assert.match(answer, /₹50,000\.00/);
});

// ============================================================================
// TEST 7: Ask for a supplier breakdown & verify total against underlying records
// ============================================================================
test("7. Supplier breakdown returns ranked suppliers matching total payables", async () => {
  const question = "Show me the top five suppliers";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "supplier_payables");

  const result = await queryFinancialTool({ userId: userA_Id, intent, period: "this-month", question });
  assert.equal(result.suppliers.length, 2);
  assert.equal(result.suppliers[0].supplierName, "Steel Corp");
  assert.equal(result.suppliers[0].amount, 80000);
  assert.equal(result.suppliers[1].supplierName, "Apex Cement");
  assert.equal(result.suppliers[1].amount, 70000);

  const sumSuppliers = result.suppliers.reduce((s, sup) => s + sup.amount, 0);
  assert.equal(sumSuppliers, result.amount);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Steel Corp/);
  assert.match(answer, /₹80,000\.00/);
  assert.match(answer, /Apex Cement/);
  assert.match(answer, /₹70,000\.00/);
});

// ============================================================================
// TEST 8: Ask for a historical comparison & verify both periods
// ============================================================================
test("8. Expense comparison analyzes current vs last month with primary drivers", async () => {
  const question = "Why did my expenses increase this month?";
  const intent = recognizeFinancialIntent(question);
  assert.equal(intent, "expense_comparison");

  const result = await queryFinancialTool({ userId: userA_Id, intent, question });
  assert.equal(result.currentTotal, 90000);
  assert.equal(result.previousTotal, 60000);
  assert.equal(result.changeAmount, 30000);
  assert.equal(result.direction, "increased");

  // Primary drivers should identify Salaries (+10k), Rent (+10k), Utilities (+10k)
  assert.equal(result.primaryDrivers.length, 3);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /increased by \*\*₹30,000\.00\*\*/);
  assert.match(answer, /Salaries/);
  assert.match(answer, /Rent/);
});

// ============================================================================
// TEST 9: Test missing record & graceful error handling
// ============================================================================
test("9. Missing invoice number returns clean informative response", async () => {
  const question = "What is the balance of invoice INV-999?";
  const result = await queryFinancialTool({ userId: userA_Id, intent: "invoice_details", question });
  assert.equal(result.found, false);
  assert.match(result.message, /not found/i);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /not found in your records/i);
});

// ============================================================================
// TEST 10: Test company isolation & role-based access
// ============================================================================
test("10. Company isolation prevents leakage of Company B data to Company A", async () => {
  // Query receivables for Company A
  const recA = await getTotalReceivables({ userId: userA_Id, period: "this-month" });
  assert.equal(recA.amount, 100000); // 50k (INV-A01 updated) + 50k (INV-A02)

  // Verify none of Company B's ₹999,999 is included
  const hasCompBInv = recA.invoices.some((inv) => inv.invoiceNumber === "INV-B99");
  assert.equal(hasCompBInv, false, "Company A must never see Company B invoices");

  // Query receivables for Company B
  const recB = await getTotalReceivables({ userId: userB_Id, period: "this-month" });
  assert.equal(recB.amount, 999999);
  assert.equal(recB.invoices[0].invoiceNumber, "INV-B99");
});

// ============================================================================
// TEST 11: Multi-Module Coverage: Inventory, GST, Ratios, Cash Flow, Payroll
// ============================================================================
test("11. Inventory valuation correctly computes total stock and low stock alerts", async () => {
  const result = await getInventoryValuationData({ userId: userA_Id });
  // Hydraulic Pump: 5 * 10,000 = 50,000
  // Safety Helmets: 50 * 500 = 25,000
  // Total = 75,000
  assert.equal(result.totalValuation, 75000);
  assert.equal(result.totalSkuCount, 2);
  assert.equal(result.lowStockCount, 1);
  assert.equal(result.lowStockItems[0].sku, "HP-100");

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /₹75,000\.00/);
  assert.match(answer, /HP-100/);
});

test("12. Payroll summary calculates gross, net, and statutory deductions", async () => {
  const result = await getPayrollData({ userId: userA_Id });
  assert.equal(result.employeeCount, 1);
  assert.equal(result.totalGrossSalary, 55000);
  assert.equal(result.totalNetSalary, 48000);
  assert.equal(result.totalDeductions, 7000);

  const answer = formatFinancialAnswer(result);
  assert.match(answer, /John Doe/);
  assert.match(answer, /₹48,000\.00/);
});

test("13. Financial ratios compute Current Ratio, Quick Ratio, and Margins", async () => {
  const result = await getFinancialRatiosData({ userId: userA_Id, period: "this-month" });
  assert.ok(result.ratios.currentRatio);
  assert.ok(result.ratios.netProfitMargin);
  const answer = formatFinancialAnswer(result);
  assert.match(answer, /Current Ratio/);
  assert.match(answer, /Net Profit Margin/);
});

test("14. Cash flow forecast projects 6 months using trend analysis", async () => {
  const result = await getCashFlowForecastData({ userId: userA_Id, months: 6 });
  assert.equal(result.predictions.length, 6);
  assert.ok(result.summary.averageMonthlyInflow >= 0);
  const answer = formatFinancialAnswer(result);
  assert.match(answer, /6-Month Projected Cash Flow Forecast/);
});
