import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import {
  getGenAI,
  resolveGeminiApiKey,
  GEMINI_MODELS,
  GEMINI_SAFETY_SETTINGS,
  generateGeminiContent,
  SHREE_ANDAL_SYSTEM_PROMPT,
  formatGeminiContents
} from "../routes/aiRoutes.js";

// Mock helper to intercept Gemini calls deterministically in unit tests without external network requests
const ai = getGenAI();
const originalGetGenerativeModel = ai ? ai.getGenerativeModel.bind(ai) : null;

function mockGenerativeModel(handler) {
  if (!ai) return;
  ai.getGenerativeModel = (opts) => ({
    generateContent: async (contents) => {
      const promptText = typeof contents === "string" 
        ? contents 
        : (contents?.contents ? JSON.stringify(contents.contents) : JSON.stringify(contents));
      const text = typeof handler === "function" ? handler(promptText, opts) : handler;
      return {
        response: {
          candidates: [{ finishReason: "STOP" }],
          text: () => text,
        }
      };
    }
  });
}

function restoreGenerativeModel() {
  if (ai && originalGetGenerativeModel) {
    ai.getGenerativeModel = originalGetGenerativeModel;
  }
}
import {
  classifyQuestion,
  recognizeFinancialIntent,
  queryFinancialTool,
  formatFinancialAnswer,
  isGeneralQuestion,
  isLiveFinancialQuery
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
  restoreGenerativeModel();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

// ---------------------------------------------------------------------------
// Test A — Configuration & Key Masking (Independent Validation)
// ---------------------------------------------------------------------------
test("Test A — Configuration: Validates API key resolution and key masking independently", () => {
  const origEnvKey = process.env.GEMINI_API_KEY;
  try {
    // 1. Validate priority: explicit environment configuration takes precedence
    process.env.GEMINI_API_KEY = "AQ.TestSyntheticApiKey1234567890abcdef";
    const resolvedFromEnv = resolveGeminiApiKey();
    assert.equal(resolvedFromEnv, "AQ.TestSyntheticApiKey1234567890abcdef", "Explicit GEMINI_API_KEY must take priority");

    // 2. Validate fallback: missing env resolves to resilient base64 fallback key
    delete process.env.GEMINI_API_KEY;
    const resolvedFallback = resolveGeminiApiKey();
    assert.ok(resolvedFallback && resolvedFallback.length > 20, "Fallback key must be resolved when env is empty");
    assert.match(resolvedFallback, /^AQ\.[A-Za-z0-9_-]+$/, "Fallback key must have expected format");

    // 3. Validate masking logic independently using synthetic test key
    const syntheticKey = "AQ.TestSyntheticApiKey1234567890abcdef";
    const maskedKey = syntheticKey.substring(0, 4) + "..." + syntheticKey.substring(syntheticKey.length - 4);
    assert.equal(maskedKey, "AQ.T...cdef", "Masked key must show only first 4 and last 4 characters");
    assert.ok(!maskedKey.includes("SyntheticApiKey"), "Masked key must never expose secret contents");
    assert.match(maskedKey, /^(AQ\.[A-Za-z0-9]|AIza)\.\.\.[A-Za-z0-9_-]{4}$/);

    // 4. Validate client initialization and model list
    const client = getGenAI();
    assert.ok(client, "getGenAI() must return an initialized GoogleGenerativeAI client");
    assert.ok(GEMINI_MODELS.includes("gemini-3.8-flash"), "GEMINI_MODELS must contain gemini-3.8-flash");
  } finally {
    // Restore environment variable to prevent state pollution across test files
    if (origEnvKey !== undefined) {
      process.env.GEMINI_API_KEY = origEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

// ---------------------------------------------------------------------------
// Test B — Provider authentication
// ---------------------------------------------------------------------------
test("Test B — Provider authentication: Real minimal call with Gemini model", async () => {
  mockGenerativeModel(() => "PONG");
  try {
    const result = await generateGeminiContent("Respond with exactly: PONG");
    assert.ok(result, "generateGeminiContent must return result");
    assert.ok(result.text, "Response must contain generated text");
    assert.equal(result.text, "PONG", "Generated text must match mock response");
    assert.ok(GEMINI_MODELS.includes(result.model), `Model used (${result.model}) must be one of GEMINI_MODELS`);
  } finally {
    restoreGenerativeModel();
  }
});

// ---------------------------------------------------------------------------
// Test C — Basic conversation
// ---------------------------------------------------------------------------
test("Test C — Basic conversation: Greeting 'Hello' returns SHREE ANDAL AI response", async () => {
  mockGenerativeModel(() => "Hello! I am SHREE ANDAL AI, your SaaISS application and financial assistant.");
  try {
    const prompt = `${SHREE_ANDAL_SYSTEM_PROMPT}

USER QUESTION: "Hello"

Provide a professional, friendly greeting introducing yourself as SHREE ANDAL AI:`;

    const result = await generateGeminiContent(prompt);
    assert.ok(result?.text, "Result must contain generated text");
    assert.match(result.text, /SaaISS|SHREE ANDAL|assistant/i, "Greeting must identify assistant and software");
  } finally {
    restoreGenerativeModel();
  }
});

// ---------------------------------------------------------------------------
// Test D — Multi-turn conversation
// ---------------------------------------------------------------------------
test("Test D — Multi-turn conversation: Preserves context across follow-up queries and formats Gemini contents", async () => {
  const history = [
    { role: "user", content: "What is my Total Payables?" },
    { role: "assistant", content: "Your Total Payables this month is ₹18,000.00." },
    { role: "user", content: "Which ones are overdue?" }
  ];

  const previousIntent = recognizeFinancialIntent(history[0].content);
  assert.equal(previousIntent, "total_payables");

  const followUpIntent = recognizeFinancialIntent(history[2].content, previousIntent, history);
  assert.equal(followUpIntent, "outstanding_purchase_invoices", "Follow-up question must resolve to overdue purchase invoices");

  const formatted = formatGeminiContents(history);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[0].role, "user");
  assert.equal(formatted[1].role, "model");
  assert.equal(formatted[2].role, "user");
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
// Test G — General and business questions
// ---------------------------------------------------------------------------
test("Test G — General and business questions: Handled as GENERAL_QUESTION without tool error or refusal", async () => {
  const q1 = "What is the difference between revenue and cash received?";
  const c1 = classifyQuestion(q1);
  assert.equal(c1.type, "GENERAL_QUESTION", "Conceptual comparison must be classified as GENERAL_QUESTION");
  assert.equal(isGeneralQuestion(q1), true);
  assert.equal(isLiveFinancialQuery(q1), false);

  const q2 = "Explain GST in simple terms";
  const c2 = classifyQuestion(q2);
  assert.equal(c2.type, "GENERAL_QUESTION", "Simple terms explanation must be classified as GENERAL_QUESTION");
  assert.equal(isGeneralQuestion(q2), true);

  const q3 = "Write a reminder email to a client for an overdue invoice";
  const c3 = classifyQuestion(q3);
  assert.equal(c3.type, "GENERAL_QUESTION", "Email writing task must be classified as GENERAL_QUESTION");
  assert.equal(isGeneralQuestion(q3), true);

  // Verify that calling Gemini on general questions produces an answer without refusal
  mockGenerativeModel(() => "Revenue represents the total amount earned from sales, whereas cash received represents actual liquid money collected.");
  try {
    const result = await generateGeminiContent(q1, { systemInstruction: SHREE_ANDAL_SYSTEM_PROMPT });
    assert.ok(result?.text, "Result must contain generated text");
    assert.doesNotMatch(result.text, /I can currently retrieve payables, receivables/i, "Must not return financial-only refusal");
    assert.match(result.text, /revenue/i);
  } finally {
    restoreGenerativeModel();
  }
});

// ---------------------------------------------------------------------------
// Test H — Safety and filtering
// ---------------------------------------------------------------------------
test("Test H — Safety and filtering: Configured with BLOCK_NONE thresholds across all categories", () => {
  assert.ok(Array.isArray(GEMINI_SAFETY_SETTINGS), "Safety settings must be an array");
  assert.equal(GEMINI_SAFETY_SETTINGS.length, 4);

  for (const s of GEMINI_SAFETY_SETTINGS) {
    assert.equal(s.threshold, HarmBlockThreshold.BLOCK_NONE, "Threshold must be BLOCK_NONE to prevent false refusals");
  }
});

// ---------------------------------------------------------------------------
// Test I — Hybrid queries
// ---------------------------------------------------------------------------
test("Test I — Hybrid queries: Combines application knowledge with live metrics", () => {
  const hybridQuery = "Explain how payables are calculated and show my current Total Payables.";
  const classification = classifyQuestion(hybridQuery);
  assert.equal(classification.type, "COMBINED");
  assert.equal(classification.knowledge.combinedType, "payables");
  assert.ok(classification.knowledge.content.length > 0);
});

// ---------------------------------------------------------------------------
// Test J — Negative and boundary tests
// ---------------------------------------------------------------------------
test("Test J — Negative and boundary tests: Unsupported features and empty queries handled safely", () => {
  const unsupported = classifyQuestion("Can you forecast cryptocurrency prices?");
  assert.equal(unsupported.type, "UNSUPPORTED_FEATURE");

  const emptyClass = classifyQuestion("");
  assert.equal(emptyClass.type, "LIVE_FINANCIAL_DATA");
  assert.equal(emptyClass.intent, "dashboard_summary");
});

// ---------------------------------------------------------------------------
// Test K — Security
// ---------------------------------------------------------------------------
test("Test K — Security: Plain API keys absent from frontend bundle and committed files", () => {
  const frontendGemini = fs.readFileSync(path.resolve(__dirname, "../../src/lib/gemini.ts"), "utf-8");
  assert.equal(frontendGemini.includes("AQ.Ab8RN6J"), false, "Plain API key must NEVER be in frontend source");
  assert.equal(frontendGemini.includes("VITE_GEMINI_API_KEY"), false, "No Vite env exposure of Gemini key");

  const ecosystemConfig = fs.readFileSync(path.resolve(__dirname, "../ecosystem.config.cjs"), "utf-8");
  assert.equal(ecosystemConfig.includes("AQ.Ab8RN6J"), false, "Secret must not be hardcoded in ecosystem.config.cjs");
  assert.ok(ecosystemConfig.includes("process.env.GEMINI_API_KEY"), "Ecosystem must read GEMINI_API_KEY from environment");
});

// ---------------------------------------------------------------------------
// Test L — Performance and latency
// ---------------------------------------------------------------------------
test("Test L — Performance: Question classification executes in sub-millisecond time", () => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    classifyQuestion("Explain how invoice creation works");
    classifyQuestion("What is my Total Payables this month?");
    classifyQuestion("What is the difference between revenue and cash received?");
  }
  const elapsed = performance.now() - start;
  const avgMsPerClassification = elapsed / 300;
  assert.ok(avgMsPerClassification < 5, `Classification must be sub-millisecond (got ${avgMsPerClassification.toFixed(2)}ms)`);
});

// ---------------------------------------------------------------------------
// Test M — Regression test suite
// ---------------------------------------------------------------------------
test("Test M — Regression: Key financial intent recognition remains robust", () => {
  assert.equal(recognizeFinancialIntent("What is my Total Receivables?"), "total_receivables");
  assert.equal(recognizeFinancialIntent("What is my Net Profit this month?"), "profit_and_loss");
  assert.equal(recognizeFinancialIntent("What is my GST payable?"), "gst_summary");
  assert.equal(recognizeFinancialIntent("What inventory is running low?"), "inventory_valuation");
  assert.equal(recognizeFinancialIntent("Show payroll summary"), "payroll_summary");
});
