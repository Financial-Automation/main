import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  searchApplicationKnowledge,
  formatKnowledgeAnswer,
  APPLICATION_MODULES,
} from "../utils/applicationKnowledge.js";
import {
  classifyQuestion,
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer,
} from "../utils/financialAssistant.js";
import { getPurchaseInvoiceModel, getTotalPayables } from "../utils/financialTools.js";
import Invoice from "../models/Invoice.js";

let mongod;
const testUserId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const now = new Date();
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 10);
  const futureDueDate = new Date(now.getFullYear(), now.getMonth(), 28);
  const pastDueDate = new Date(now.getFullYear(), now.getMonth(), 2);

  // Seed Sales Invoices
  await Invoice.create([
    {
      userId: testUserId,
      businessName: "SaaISS Enterprise",
      customerName: "Acme Global",
      invoiceNumber: "INV-2026-001",
      invoiceDate: currentMonthDate,
      dueDate: futureDueDate,
      items: [
        { productName: "SaaS Subscription", quantity: 1, unitPrice: 50000, total: 50000 },
      ],
      subtotal: 50000,
      taxAmount: 9000,
      grandTotal: 59000,
      amountPaid: 19000,
      balanceDue: 40000,
      status: "sent",
      paymentStatus: "partial",
    },
  ]);

  // Seed Purchase Invoices: 2 open bills (one overdue, one not overdue)
  const PurchaseInvoice = getPurchaseInvoiceModel();
  await PurchaseInvoice.create([
    {
      userId: testUserId,
      supplierName: "Apex Cloud Services",
      billNo: "BILL-2026-01",
      billDate: currentMonthDate.toISOString().split("T")[0],
      dueDate: pastDueDate.toISOString().split("T")[0],
      createdAt: currentMonthDate,
      total: 10000,
      paid: 0,
      balance: 10000,
      status: "approved",
      paymentStatus: "unpaid",
    },
    {
      userId: testUserId,
      supplierName: "Bharat Telecom",
      billNo: "BILL-2026-02",
      billDate: currentMonthDate.toISOString().split("T")[0],
      dueDate: futureDueDate.toISOString().split("T")[0],
      createdAt: currentMonthDate,
      total: 8000,
      paid: 0,
      balance: 8000,
      status: "approved",
      paymentStatus: "unpaid",
    },
  ]);
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// ============================================================================
// 12 MANDATORY REGRESSION TEST QUESTIONS (PROMPT SECTION 9)
// ============================================================================

test("1. 'Explain how invoice creation works.'", () => {
  const q = "Explain how invoice creation works.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "sales_invoice");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Invoice creation in your SaaISS accounting software works/i);
  assert.match(formatted, /Sales Invoice module/i);
  assert.match(formatted, /Invoice creation — step by step/i);
  assert.match(formatted, /Correct backend workflow for your SaaISS project/i);
});

test("2. 'How do I create a sales invoice?'", () => {
  const q = "How do I create a sales invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "sales_invoice");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Customer Name/i);
  assert.match(formatted, /Line Items/i);
  assert.match(formatted, /Save Invoice/i);
  assert.match(formatted, /GST/i);
});

test("3. 'How do I create a purchase invoice?'", () => {
  const q = "How do I create a purchase invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "purchase_invoice");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Supplier Name/i);
  assert.match(formatted, /Bill Number/i);
  assert.match(formatted, /\/inventory/);
  assert.match(formatted, /Accounts Payable/i);
});

test("4. 'How do I print an invoice?'", () => {
  const q = "How do I print an invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Print/i);
  assert.match(formatted, /Download PDF/i);
  assert.match(formatted, /Sales Invoices/i);
  assert.match(formatted, /Purchase Invoices/i);
});

test("5. 'How do I apply a payment to an invoice?'", () => {
  const q = "How do I apply a payment to an invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "apply_payment");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Apply Payment/i);
  assert.match(formatted, /POST \/api\/invoice\/:id\/payment/);
  assert.match(formatted, /PAID/i);
  assert.match(formatted, /PARTIAL/i);
});

test("6. 'What happens when I save a purchase invoice?'", () => {
  const q = "What happens when I save a purchase invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.category, "post_save");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /PurchaseInvoice/);
  assert.match(formatted, /Bookkeeping/i);
  assert.match(formatted, /Inventory/i);
  assert.match(formatted, /Total Payables/i);
});

test("7. 'Explain the difference between sales invoices and purchase invoices.'", () => {
  const q = "Explain the difference between sales invoices and purchase invoices.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Accounts Receivable/i);
  assert.match(formatted, /Accounts Payable/i);
  assert.match(formatted, /Input Tax Credit/i);
  assert.match(formatted, /Output GST/i);
});

test("8. 'What is my Total Payables this month?'", async () => {
  const q = "What is my Total Payables this month?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "LIVE_FINANCIAL_DATA");
  assert.equal(classification.intent, "total_payables");

  const result = await queryFinancialTool({
    userId: testUserId,
    intent: classification.intent,
    period: "this-month",
    question: q,
  });

  assert.equal(result.amount, 18000); // 10000 + 8000
  assert.equal(result.outstandingInvoiceCount, 2);
  assert.equal(result.overdueAmount, 10000);

  const formatted = formatFinancialAnswer(result);
  assert.match(formatted, /₹18,000\.00/);
  assert.match(formatted, /2/);
});

test("9. 'Show my outstanding purchase invoices.'", async () => {
  const q = "Show my outstanding purchase invoices.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "LIVE_FINANCIAL_DATA");
  assert.equal(classification.intent, "outstanding_purchase_invoices");

  const result = await queryFinancialTool({
    userId: testUserId,
    intent: classification.intent,
    period: "this-month",
    question: q,
  });

  const formatted = formatFinancialAnswer(result);
  assert.match(formatted, /Outstanding Purchase Invoices/i);
  assert.match(formatted, /BILL-2026-01/);
  assert.match(formatted, /BILL-2026-02/);
  assert.match(formatted, /Apex Cloud Services/);
  assert.match(formatted, /Bharat Telecom/);
  assert.match(formatted, /₹18,000\.00/);
});

test("10. 'Explain how payables are calculated and show my current Total Payables.'", async () => {
  const q = "Explain how payables are calculated and show my current Total Payables.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "COMBINED");
  assert.equal(classification.knowledge.combinedType, "payables");

  const explanation = formatKnowledgeAnswer(classification.knowledge);
  assert.match(explanation, /Formula/i);
  assert.match(explanation, /Total Payables = Sum of \(Bill Total - Amount Paid\)/i);
  assert.match(explanation, /Cancelled bills and deleted purchase invoices are strictly excluded/i);

  // Simulate combined response assembly in cfo-chat
  const livePayables = await getTotalPayables({ userId: testUserId, period: "this-month" });
  assert.equal(livePayables.amount, 18000);
  const combinedAnswer =
    explanation +
    `\n\n### Current Live Total Payables (Dashboard Parity)\n- **Current Total Payables:** ₹${livePayables.amount.toLocaleString("en-IN")}\n- **Outstanding Vendor Bills:** ${livePayables.outstandingInvoiceCount}`;

  assert.match(combinedAnswer, /₹18,000/);
  assert.match(combinedAnswer, /Outstanding Vendor Bills.*2/);
});

test("11. 'What does the net profit metric on my dashboard mean?'", () => {
  const q = "What does the net profit metric on my dashboard mean?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.category, "calculation_explanation");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Net Profit = Total Operating Revenue - Total Operating Expenses/i);
  assert.match(formatted, /getFinanceMetrics/);
  assert.match(formatted, /Profitable/i);
  assert.match(formatted, /Operating at Loss/i);
});

test("12. 'Why is my invoice payment not updating?'", () => {
  const q = "Why is my invoice payment not updating?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.category, "troubleshooting");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Troubleshooting: Invoice Balance Not Decreasing/i);
  assert.match(formatted, /Apply Payment/i);
  assert.match(formatted, /partial payment/i);
  assert.match(formatted, /POST \/api\/invoice\/:id\/payment/);
});

// ============================================================================
// ADDITIONAL WORKFLOW VERIFICATIONS
// ============================================================================

test("13. 'How do I add a customer?'", () => {
  const q = "How do I add a customer?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "customer_management");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Customer Name/i);
  assert.match(formatted, /Billing Address/i);
  assert.match(formatted, /Customer GSTIN/i);
});

test("14. 'How do I add a supplier?'", () => {
  const q = "How do I add a supplier?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "supplier_management");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /Supplier Name/i);
  assert.match(formatted, /Supplier GSTIN/i);
  assert.match(formatted, /\/inventory/);
});

test("15. 'How does inventory update after a purchase or sale?'", () => {
  const q = "How does inventory update after a purchase or sale?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /InventoryItem/);
  assert.match(formatted, /POST \/api\/purchase-invoice\/create/);
  assert.match(formatted, /POST \/api\/inventory\/reserve\/:id/);
  assert.match(formatted, /Low Stock/i);
});

test("16. 'How do I generate a profit and loss report?'", () => {
  const q = "How do I generate a profit and loss report?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "profit_loss");
  const formatted = formatKnowledgeAnswer(classification.knowledge);
  assert.match(formatted, /\/profit-loss/);
  assert.match(formatted, /\/api\/profitloss\/generate/);
  assert.match(formatted, /getFinanceMetrics/);
});
