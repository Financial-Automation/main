import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  retrieveKnowledge,
  formatQaAnswer,
} from "../utils/qaRetrievalEngine.js";
import {
  classifyQuestion,
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer,
} from "../utils/financialAssistant.js";
import { getPurchaseInvoiceModel, getTotalPayables } from "../utils/financialTools.js";
import { formatKnowledgeAnswer } from "../utils/applicationKnowledge.js";
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

  // Seed Sales Invoice (Revenue & AR)
  await Invoice.create([
    {
      userId: testUserId,
      businessName: "SaaISS Enterprise",
      customerName: "Global Tech Inc",
      invoiceNumber: "INV-2026-001",
      invoiceDate: currentMonthDate,
      dueDate: futureDueDate,
      items: [
        { productName: "Cloud Infrastructure", quantity: 1, unitPrice: 50000, total: 50000 },
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

  // Seed Purchase Invoices (Payables)
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

const REFUSAL_SUBSTRING = "I can currently retrieve payables, receivables, sales, expenses, and profit and loss";

// ============================================================================
// PART 7 — THE 15 LIVE CHATBOT VERIFICATION QUESTIONS
// ============================================================================

test("1. 'Explain how invoice creation works.'", () => {
  const q = "Explain how invoice creation works.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Invoice creation in your SaaISS accounting software works/i);
  assert.match(reply, /Invoice creation — step by step/i);
  assert.match(reply, /The user opens the Sales Invoice module.*and clicks Create Invoice/i);
  assert.match(reply, /Correct backend workflow for your SaaISS project/i);
  assert.match(reply, /Central Accounting Engine/i);
});

test("2. 'How can I make a bill for my customer?'", () => {
  const q = "How can I make a bill for my customer?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Customer/i);
  assert.match(reply, /Line Items/i);
  assert.match(reply, /\/invoice/);
});

test("3. 'How do I create a purchase invoice?'", () => {
  const q = "How do I create a purchase invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Supplier/i);
  assert.match(reply, /Purchase/i);
  assert.match(reply, /\/inventory/);
  assert.match(reply, /Bill/i);
});

test("4. 'Where can I find a saved invoice?'", () => {
  const q = "Where can I find a saved invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /History/i);
  assert.match(reply, /\/invoice/);
  assert.match(reply, /Purchase Invoices/i);
});

test("5. 'How do I print an invoice PDF?'", () => {
  const q = "How do I print an invoice PDF?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Print/i);
  assert.match(reply, /Download PDF/i);
});

test("6. 'How do I apply a payment?'", () => {
  const q = "How do I apply a payment?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Apply Payment|Record Payment/i);
  assert.match(reply, /balance/i);
});

test("7. 'What is the difference between sales and purchase invoices?'", () => {
  const q = "What is the difference between sales and purchase invoices?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Accounts Receivable/i);
  assert.match(reply, /Accounts Payable/i);
});

test("8. 'What does Total Payables mean?'", () => {
  const q = "What does Total Payables mean?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /Total Payables represents/i);
  assert.match(reply, /suppliers/i);
  assert.match(reply, /Sum of \(Bill Total - Amount Paid\)/i);
});

test("9. 'What is my Total Payables this month?'", async () => {
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

  assert.equal(result.amount, 18000);
  assert.equal(result.outstandingInvoiceCount, 2);
  assert.equal(result.overdueAmount, 10000);

  const formatted = formatFinancialAnswer(result);
  assert.match(formatted, /₹18,000\.00/);
  assert.doesNotMatch(formatted, new RegExp(REFUSAL_SUBSTRING, "i"));
});

test("10. 'Explain how payables are calculated and show my current Total Payables.'", async () => {
  const q = "Explain how payables are calculated and show my current Total Payables.";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "COMBINED");
  assert.equal(classification.knowledge.combinedType, "payables");

  const explanation = formatKnowledgeAnswer(classification.knowledge);
  assert.match(explanation, /Formula/i);
  assert.match(explanation, /Total Payables = Sum of \(Bill Total - Amount Paid\)/i);

  const livePayables = await getTotalPayables({ userId: testUserId, period: "this-month" });
  assert.equal(livePayables.amount, 18000);
  const combinedAnswer =
    explanation +
    `\n\n### Current Live Total Payables (Dashboard Parity)\n- **Current Total Payables:** ₹${livePayables.amount.toLocaleString("en-IN")}\n- **Outstanding Vendor Bills:** ${livePayables.outstandingInvoiceCount}`;

  assert.match(combinedAnswer, /₹18,000/);
  assert.doesNotMatch(combinedAnswer, new RegExp(REFUSAL_SUBSTRING, "i"));
});

test("11. 'How does inventory work?'", () => {
  const q = "How does inventory work?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /InventoryItem|inventory/i);
  assert.match(reply, /stock/i);
  assert.match(reply, /Low Stock/i);
});

test("12. 'How do I view my profit and loss report?'", () => {
  const q = "How do I view my profit and loss report?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /\/profit-loss/);
  assert.match(reply, /Revenue/i);
  assert.match(reply, /Net Profit/i);
});

test("13. 'What is cash flow prediction?'", () => {
  const q = "What is cash flow prediction?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /cash flow/i);
  assert.match(reply, /regression|forecast|prediction/i);
  assert.match(reply, /\/cashflow/);
});

test("14. 'Why are my dashboard and AI CFO showing different amounts?'", () => {
  const q = "Why are my dashboard and AI CFO showing different amounts?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /reporting period|same authoritative calculation service|parity/i);
  assert.match(reply, /getTotalPayables/i);
});

test("15. 'Why is my invoice not saving?'", () => {
  const q = "Why is my invoice not saving?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  const reply = formatKnowledgeAnswer(classification.knowledge);

  assert.doesNotMatch(reply, new RegExp(REFUSAL_SUBSTRING, "i"));
  assert.match(reply, /mandatory fields|Customer Name|Invoice Date/i);
  assert.match(reply, /duplicate/i);
});
