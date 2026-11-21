import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  searchApplicationKnowledge,
  formatKnowledgeAnswer,
  APPLICATION_MODULES
} from "../utils/applicationKnowledge.js";
import {
  classifyQuestion,
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer
} from "../utils/financialAssistant.js";
import { getPurchaseInvoiceModel } from "../utils/financialTools.js";
import Invoice from "../models/Invoice.js";

let mongod;
const testUserId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const now = new Date();
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 10);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 10);

  // Seed Sales Invoices
  await Invoice.create([
    {
      userId: testUserId,
      businessName: "Acme Corp",
      customerName: "Client Alpha",
      invoiceNumber: "INV-AK-001",
      invoiceDate: currentMonthDate,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 25),
      items: [
        {
          productName: "Consulting Service",
          quantity: 1,
          unitPrice: 100000,
          total: 100000
        }
      ],
      subtotal: 100000,
      taxAmount: 18000,
      grandTotal: 118000,
      amountPaid: 38000,
      balanceDue: 80000,
      status: "sent",
      paymentStatus: "partial"
    }
  ]);

  // Seed Purchase Invoices (Current Month and Last Month for comparison)
  const PurchaseInvoice = getPurchaseInvoiceModel();
  await PurchaseInvoice.create([
    {
      userId: testUserId,
      supplierName: "Vendor Beta",
      billNo: "BILL-CURR-01",
      billDate: currentMonthDate,
      createdAt: currentMonthDate,
      stateOfSupply: "Maharashtra",
      subtotal: 200000,
      tax: 36000,
      total: 236000,
      amountPaid: 86000,
      balance: 150000,
      status: "partial"
    },
    {
      userId: testUserId,
      supplierName: "Vendor Gamma",
      billNo: "BILL-PREV-01",
      billDate: lastMonthDate,
      createdAt: lastMonthDate,
      stateOfSupply: "Maharashtra",
      subtotal: 100000,
      tax: 18000,
      total: 118000,
      amountPaid: 18000,
      balance: 100000,
      status: "partial"
    }
  ]);
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// Test 1: Explain how invoice creation works
test("1. 'Explain how invoice creation works' returns Sales Invoice creation workflow", () => {
  const q = "Explain how invoice creation works";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "sales_invoice");
  assert.equal(classification.knowledge.topic, "Sales Invoice Creation Workflow");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("/invoice"));
  assert.ok(reply.includes("Customer Details"));
  assert.ok(reply.includes("Save Invoice"));
  assert.ok(reply.includes("Validation & Business Rules"));
});

// Test 2: How do I create a purchase invoice?
test("2. 'How do I create a purchase invoice?' returns Purchase Invoice workflow and distinguishes from sales", () => {
  const q = "How do I create a purchase invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "purchase_invoice");
  assert.equal(classification.knowledge.topic, "Purchase Invoice Creation Workflow");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("/inventory"));
  assert.ok(reply.includes("Supplier Information") || reply.includes("Supplier Name"));
  assert.ok(reply.includes("Bill Details") || reply.includes("Bill Number"));
  // Must NOT describe customer sales invoice workflow
  assert.ok(!reply.includes("Customer Name (Required)"));
});

// Test 3: What happens after I save a sales invoice?
test("3. 'What happens after I save a sales invoice?' returns verified post-save effects", () => {
  const q = "What happens after I save a sales invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "What Happens After Saving a Sales Invoice");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("MongoDB"));
  assert.ok(reply.includes("Automated Bookkeeping") || reply.includes("BookkeepingEntry"));
  assert.ok(reply.includes("Inventory Deduction") || reply.includes("inventory"));
  assert.ok(reply.includes("Total Receivables"));
});

// Test 4: How does Apply Payment work?
test("4. 'How does Apply Payment work?' explains payment modal, balance formula, and status transitions", () => {
  const q = "How does Apply Payment work?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "apply_payment");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Apply Payment") || reply.includes("Record Payment"));
  assert.ok(reply.includes("POST /api/invoice/:id/payment"));
  assert.ok(reply.includes("PAID") && reply.includes("PARTIAL"));
  assert.ok(reply.includes("Total Receivables"));
});

// Test 5: Why is my invoice balance not decreasing after payment?
test("5. 'Why is my invoice balance not decreasing after payment?' returns actionable troubleshooting", () => {
  const q = "Why is my invoice balance not decreasing after payment?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.category, "troubleshooting");
  assert.equal(classification.knowledge.topic, "Troubleshooting: Invoice Balance Not Decreasing");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Apply Payment"));
  assert.ok(reply.includes("partial payment"));
  assert.ok(reply.includes("Troubleshooting Steps"));
});

// Test 6: How do I print and download a purchase invoice?
test("6. 'How do I print and download a purchase invoice?' returns purchase invoice print steps", () => {
  const q = "How do I print and download a purchase invoice?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "Print & Download Purchase Invoices");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("/inventory"));
  assert.ok(reply.includes("Download PDF") || reply.includes("Print"));
});

// Test 7: How is Total Payables calculated?
test("7. 'How is Total Payables calculated?' explains formula, exclusions, and authoritative source", () => {
  const q = "How is Total Payables calculated?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "How Total Payables is Calculated");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Total Payables = Sum of (Bill Total - Amount Paid)"));
  assert.ok(reply.includes("Exclusions") && reply.includes("Cancelled bills"));
  assert.ok(reply.includes("Dashboard KPI card") || reply.includes("getTotalPayables"));
});

// Test 8: What is my current Total Payables?
test("8. 'What is my current Total Payables?' retrieves authoritative live data matching dashboard", async () => {
  const q = "What is my current Total Payables?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "LIVE_FINANCIAL_DATA");
  assert.equal(classification.intent, "total_payables");

  const result = await queryFinancialTool({
    userId: testUserId,
    intent: classification.intent,
    period: "this-month",
    question: q
  });

  assert.equal(result.amount, 150000);
  assert.equal(result.outstandingInvoiceCount, 1);
  const reply = formatFinancialAnswer(result);
  assert.ok(reply.includes("₹1,50,000.00"));
});

// Test 9: Explain how bank reconciliation works
test("9. 'Explain how bank reconciliation works' returns bank reconciliation workflow", () => {
  const q = "Explain how bank reconciliation works";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.module.id, "bank_reconciliation");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("/bank-reconciliation"));
  assert.ok(reply.includes("Upload Files") || reply.includes("Bank Statement"));
  assert.ok(reply.includes("matching") || reply.includes("fuzzy"));
});

// Test 10: What is the difference between Profit and Loss and Balance Sheet?
test("10. 'What is the difference between Profit and Loss and Balance Sheet?' returns verified accounting concept", () => {
  const q = "What is the difference between Profit and Loss and Balance Sheet?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "Difference Between Profit & Loss and Balance Sheet");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Profit and Loss Statement (P&L)"));
  assert.ok(reply.includes("Balance Sheet"));
  assert.ok(reply.includes("Retained Earnings"));
});

// Test 11: Explain how inventory affects my accounting
test("11. 'Explain how inventory affects my accounting' returns inventory accounting impact", () => {
  const q = "Explain how inventory affects my accounting";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "Inventory Tracking & Accounting Impact");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Current Assets"));
  assert.ok(reply.includes("Profit & Loss") || reply.includes("COGS"));
});

// Test 12: How does GST work in my application?
test("12. 'How does GST work in my application?' explains CGST, SGST, IGST, ITC and net payable", () => {
  const q = "How does GST work in my application?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.equal(classification.knowledge.topic, "GST Calculation & Workflow");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("CGST") && reply.includes("SGST") && reply.includes("IGST"));
  assert.ok(reply.includes("Input Tax Credit") || reply.includes("ITC"));
  assert.ok(reply.includes("Net GST Payable"));
});

// Test 13: Compare my current Total Payables with last month
test("13. 'Compare my current Total Payables with last month' compares periods with live numbers", async () => {
  const q = "Compare my current Total Payables with last month";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "LIVE_FINANCIAL_DATA");
  assert.equal(classification.intent, "payables_comparison");

  const result = await queryFinancialTool({
    userId: testUserId,
    intent: classification.intent,
    period: "this-month",
    question: q
  });

  assert.equal(result.tool, "payables_comparison");
  assert.equal(result.currentTotal, 150000);
  assert.equal(result.previousTotal, 100000);
  assert.equal(result.changeAmount, 50000);
  assert.equal(result.percentageChange, 50);
  assert.equal(result.direction, "increased");

  const reply = formatFinancialAnswer(result);
  assert.ok(reply.includes("Payables Analysis"));
  assert.ok(reply.includes("₹1,50,000.00"));
  assert.ok(reply.includes("₹1,00,000.00"));
  assert.ok(reply.includes("increased by **₹50,000.00**"));
});

// Test 14: Explain invoice creation and its impact on receivables
test("14. 'Explain invoice creation and its impact on receivables' returns combined workflow and financial impact", () => {
  const q = "Explain invoice creation and its impact on receivables";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "COMBINED");
  assert.equal(classification.knowledge.topic, "Invoice Creation Workflow & Impact on Total Receivables");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Sales Invoice Creation Workflow"));
  assert.ok(reply.includes("Direct Impact on Total Receivables"));
  assert.ok(reply.includes("balanceDue"));
  assert.ok(reply.includes("Apply Payment"));
});

// Test 15: Ask about a feature that does not exist and verify that the assistant does not invent it
test("15. Asking about a feature that does not exist (crypto trading) does not invent it and returns clear notice", () => {
  const q = "How do I trade cryptocurrencies and Bitcoin on SaaISS?";
  const classification = classifyQuestion(q);
  assert.equal(classification.type, "UNSUPPORTED_FEATURE");
  assert.equal(classification.knowledge.category, "unsupported_feature");

  const reply = formatKnowledgeAnswer(classification.knowledge);
  assert.ok(reply.includes("Notice: Unsupported Capability"));
  assert.ok(reply.includes("does not support cryptocurrency trading"));
  assert.ok(reply.includes("Supported capabilities include: Sales Invoicing, Purchase Invoicing"));
});
