import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { classifyQuestion, queryFinancialTool, formatFinancialAnswer } from "../utils/financialAssistant.js";
import { formatKnowledgeAnswer } from "../utils/applicationKnowledge.js";
import { getTotalPayables } from "../utils/financialTools.js";
import { getPurchaseInvoiceModel } from "../utils/financialTools.js";
import Invoice from "../models/Invoice.js";

async function run() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const testUserId = new mongoose.Types.ObjectId();

  const now = new Date();
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 10);
  const futureDueDate = new Date(now.getFullYear(), now.getMonth(), 28);
  const pastDueDate = new Date(now.getFullYear(), now.getMonth(), 2);

  // Seed test records
  await Invoice.create([
    {
      userId: testUserId,
      businessName: "SaaISS Enterprise",
      customerName: "Global Tech Inc",
      invoiceNumber: "INV-2026-001",
      invoiceDate: currentMonthDate,
      dueDate: futureDueDate,
      items: [{ productName: "Cloud Infrastructure", quantity: 1, unitPrice: 50000, total: 50000 }],
      subtotal: 50000,
      taxAmount: 9000,
      grandTotal: 59000,
      amountPaid: 19000,
      balanceDue: 40000,
      status: "sent",
      paymentStatus: "partial",
    },
  ]);

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

  const questions = [
    "Explain how invoice creation works.",
    "How can I make a bill for my customer?",
    "How do I create a purchase invoice?",
    "Where can I find a saved invoice?",
    "How do I print an invoice PDF?",
    "How do I apply a payment?",
    "What is the difference between sales and purchase invoices?",
    "What does Total Payables mean?",
    "What is my Total Payables this month?",
    "Explain how payables are calculated and show my current Total Payables.",
    "How does inventory work?",
    "How do I view my profit and loss report?",
    "What is cash flow prediction?",
    "Why are my dashboard and AI CFO showing different amounts?",
    "Why is my invoice not saving?",
  ];

  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const classification = classifyQuestion(q);
    let reply = "";
    let toolResult = null;

    if (classification.type === "APPLICATION_KNOWLEDGE" || classification.type === "UNSUPPORTED_FEATURE") {
      reply = formatKnowledgeAnswer(classification.knowledge);
    } else if (classification.type === "COMBINED") {
      reply = formatKnowledgeAnswer(classification.knowledge);
      const liveData = await getTotalPayables({ userId: testUserId, period: "this-month" });
      toolResult = liveData;
      reply += `\n\n### Current Live Total Payables (Dashboard Parity)\n- **Current Total Payables:** ₹${Number(liveData.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n- **Outstanding Vendor Bills:** ${liveData.outstandingInvoiceCount || 0}\n- **Overdue Payables:** ₹${Number(liveData.overdueAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (classification.type === "LIVE_FINANCIAL_DATA") {
      const data = await queryFinancialTool({
        userId: testUserId,
        intent: classification.intent,
        period: "this-month",
        question: q,
      });
      toolResult = data;
      reply = formatFinancialAnswer(data);
    }

    const hasRefusal = reply.includes("I can currently retrieve payables, receivables, sales, expenses, and profit and loss");
    const passed = !hasRefusal && reply.length > 30;

    results.push({
      number: i + 1,
      question: q,
      type: classification.type,
      topicOrIntent: classification.qaRecord?.canonicalQuestion || classification.knowledge?.topic || classification.intent,
      toolResult: toolResult ? { amount: toolResult.amount, outstandingCount: toolResult.outstandingInvoiceCount } : null,
      replySnippet: reply.slice(0, 150).replace(/\n/g, " ") + "...",
      status: passed ? "PASS ✅" : "FAIL ❌"
    });
  }

  console.log(JSON.stringify(results, null, 2));

  await mongoose.disconnect();
  await mongod.stop();
}

run().catch(console.error);
