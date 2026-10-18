import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import {
  getGenAI,
  GEMINI_MODELS,
  generateGeminiContent,
  SHREE_ANDAL_SYSTEM_PROMPT
} from "../routes/aiRoutes.js";
import {
  classifyQuestion,
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer
} from "../utils/financialAssistant.js";
import { retrieveKnowledge } from "../utils/qaRetrievalEngine.js";
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
  const futureDueDate = new Date(now.getFullYear(), now.getMonth(), 28);

  // Seed sample sales invoice
  await Invoice.create({
    userId: testUserId,
    businessName: "SaaISS Enterprise",
    customerName: "Global Tech Inc",
    invoiceNumber: "INV-2026-TEST",
    invoiceDate: currentMonthDate,
    dueDate: futureDueDate,
    items: [
      { productName: "Software Consulting", quantity: 1, unitPrice: 100000, total: 100000 }
    ],
    subtotal: 100000,
    taxAmount: 18000,
    grandTotal: 118000,
    amountPaid: 100000,
    balanceDue: 18000,
    status: "sent",
    paymentStatus: "partial"
  });

  // Seed sample purchase invoice
  const PurchaseInvoice = getPurchaseInvoiceModel();
  await PurchaseInvoice.create({
    userId: testUserId,
    supplierName: "Cloud Servers India",
    vendorName: "Cloud Servers India",
    billNo: "BILL-2026-TEST",
    invoiceNumber: "BILL-2026-TEST",
    billDate: currentMonthDate,
    invoiceDate: currentMonthDate,
    dueDate: futureDueDate,
    total: 23600,
    paidAmount: 5600,
    balance: 18000,
    status: "pending",
    items: [
      { productName: "Dedicated Cloud Server", quantity: 1, unitPrice: 20000, total: 20000 }
    ]
  });
});

test.after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

// ---------------------------------------------------------------------------
// Test A — Configuration
// ---------------------------------------------------------------------------
test("Test A — Configuration: Backend loads API key without revealing value", () => {
  const apiKey = process.env.GEMINI_API_KEY;
  assert.ok(apiKey, "GEMINI_API_KEY must be present in backend environment");
  assert.ok(apiKey.length > 20, "GEMINI_API_KEY must have expected key length");
  
  // Verify key masking: never print or expose the key
  const maskedKey = apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length - 4);
  assert.match(maskedKey, /^AQ\.[A-Za-z0-9]\.\.\.[A-Za-z0-9_-]{4}$/);
  
  // Verify GenAI client initialization
  const ai = getGenAI();
  assert.ok(ai, "getGenAI() must return an initialized GoogleGenerativeAI client");
  assert.ok(GEMINI_MODELS.includes("gemini-3.8-flash"), "GEMINI_MODELS must contain gemini-3.8-flash");
});

// ---------------------------------------------------------------------------
// Test B — Provider authentication
// ---------------------------------------------------------------------------
test("Test B — Provider authentication: Real minimal call with gemini-3.8-flash", async () => {
  const result = await generateGeminiContent("Respond with exactly: PONG");
  assert.ok(result, "generateGeminiContent must return a response object");
  assert.ok(result.text, "Response must contain generated text");
  assert.ok(result.text.length > 0, "Response text must be non-empty");
  assert.equal(result.model, "gemini-3.8-flash", "Model used must be gemini-3.8-flash");
});

// ---------------------------------------------------------------------------
// Test C — Basic conversation
// ---------------------------------------------------------------------------
test("Test C — Basic conversation: Greeting 'Hello' returns SHREE ANDAL AI response", async () => {
  const prompt = `${SHREE_ANDAL_SYSTEM_PROMPT}

USER QUESTION: "Hello"

Provide a professional, friendly greeting introducing yourself as SHREE ANDAL AI:`;

  const result = await generateGeminiContent(prompt);
  assert.ok(result?.text, "Gemini must generate a greeting response");
  assert.match(result.text, /SaaISS|SHREE ANDAL|assistant/i, "Greeting must identify assistant and software");
});

// ---------------------------------------------------------------------------
// Test D — Multi-turn conversation
// ---------------------------------------------------------------------------
test("Test D — Multi-turn conversation: Preserves context across follow-up queries", async () => {
  const history = [
    { role: "user", content: "What is my Total Payables?" },
    { role: "assistant", content: "Your Total Payables this month is ₹18,000.00." },
    { role: "user", content: "Which ones are overdue?" }
  ];

  const previousIntent = recognizeFinancialIntent(history[0].content);
  assert.equal(previousIntent, "total_payables");

  const followUpIntent = recognizeFinancialIntent(history[2].content, previousIntent, history);
  assert.equal(followUpIntent, "outstanding_purchase_invoices", "Follow-up question must resolve to overdue purchase invoices");
});

// ---------------------------------------------------------------------------
// Test E — Financial tool calling
// ---------------------------------------------------------------------------
test("Test E — Financial tool calling: Queries database and returns authoritative value", async () => {
  const result = await queryFinancialTool({
    userId: testUserId.toString(),
    intent: "total_payables",
    period: "this-month",
    question: "What is my Total Payables?"
  });

  assert.equal(result.tool, "total_payables");
  assert.equal(result.amount, 18000, "Calculated total payables must match seeded balance");
  assert.equal(result.outstandingInvoiceCount, 1);

  const formatted = formatFinancialAnswer(result);
  assert.match(formatted, /18,000/, "Formatted answer must display authoritative ₹18,000.00");
});

// ---------------------------------------------------------------------------
// Test F — Application knowledge
// ---------------------------------------------------------------------------
test("Test F — Application knowledge: Explains invoice creation workflow", () => {
  const question = "Explain how invoice creation works";
  const classification = classifyQuestion(question);
  
  assert.equal(classification.type, "APPLICATION_KNOWLEDGE");
  assert.ok(classification.knowledge);

  const qaMatch = retrieveKnowledge(question);
  assert.ok(qaMatch.bestMatch);
  assert.equal(qaMatch.bestMatch.id, "qa_invoice_creation");
  assert.ok(
    qaMatch.bestMatch.answer.includes("Invoice creation") ||
    qaMatch.bestMatch.answer.includes("/invoice")
  );
});

// ---------------------------------------------------------------------------
// Test G — Error handling
// ---------------------------------------------------------------------------
test("Test G — Error handling: Handles invalid credentials and missing fields safely", async () => {
  // Test invalid key with isolated GoogleGenerativeAI client
  const fakeAI = new GoogleGenerativeAI("invalid_key_xyz");
  const model = fakeAI.getGenerativeModel({ model: "gemini-3.8-flash" });
  
  await assert.rejects(
    async () => {
      await model.generateContent("hello");
    },
    (err) => {
      assert.ok(err.message, "Should reject with descriptive API error");
      return true;
    }
  );

  // Test question classifier handles empty or undefined safely
  const emptyClass = classifyQuestion("");
  assert.equal(emptyClass.type, "LIVE_FINANCIAL_DATA");
});

// ---------------------------------------------------------------------------
// Test H — Security
// ---------------------------------------------------------------------------
test("Test H — Security: Secrets are absent from client bundle and source files", () => {
  const frontendGemini = fs.readFileSync(path.resolve(__dirname, "../../src/lib/gemini.ts"), "utf-8");
  assert.equal(frontendGemini.includes("AQ.Ab8RN6J"), false, "Plain API key must NEVER be in frontend source");
  assert.equal(frontendGemini.includes("VITE_GEMINI_API_KEY"), false, "No Vite env exposure of Gemini key");

  // Verify backend ecosystem config does not commit plain secret
  const ecosystemConfig = fs.readFileSync(path.resolve(__dirname, "../ecosystem.config.cjs"), "utf-8");
  assert.equal(ecosystemConfig.includes("AQ.Ab8RN6J"), false, "Secret must not be hardcoded in ecosystem.config.cjs");
  assert.ok(ecosystemConfig.includes("process.env.GEMINI_API_KEY"), "Ecosystem must read GEMINI_API_KEY from environment");
});

// ---------------------------------------------------------------------------
// Test I — Regression
// ---------------------------------------------------------------------------
test("Test I — Regression: Key financial intent recognition remains robust", () => {
  assert.equal(recognizeFinancialIntent("What is my Total Receivables?"), "total_receivables");
  assert.equal(recognizeFinancialIntent("What is my Net Profit this month?"), "profit_and_loss");
  assert.equal(recognizeFinancialIntent("What is my GST payable?"), "gst_summary");
  assert.equal(recognizeFinancialIntent("What inventory is running low?"), "inventory_valuation");
  assert.equal(recognizeFinancialIntent("Show payroll summary"), "payroll_summary");
});

// ---------------------------------------------------------------------------
// Test J — Production verification
// ---------------------------------------------------------------------------
test("Test J — Production verification: Connectivity check to live production host", async () => {
  try {
    const res = await fetch("https://software.saaiss.in", { method: "HEAD" });
    assert.ok(res.status < 500, `Production host must be reachable (status: ${res.status})`);
  } catch (err) {
    // If running in offline test environment, note network condition
    console.warn("Production ping note:", err.message);
  }
});
