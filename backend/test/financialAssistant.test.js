import test from "node:test";
import assert from "node:assert/strict";
import { outstandingBalance, isOpenDocument, recognizeFinancialIntent, requestsLiveFinancialData, resolveAssistantPeriod } from "../utils/financialAssistant.js";
import { findBestMatch, knowledgeBaseSummary, searchKnowledgeBase } from "../utils/knowledgeBase.js";

test("outstanding balance respects recorded balances and partial payments", () => {
  assert.equal(outstandingBalance({ total: 1000, paid: 250 }), 750);
  assert.equal(outstandingBalance({ total: 1000, paid: 250, balance: 600 }), 600);
  assert.equal(outstandingBalance({ total: 1000, paid: 1500 }), 0);
});

test("paid and cancelled documents are excluded from open balances", () => {
  assert.equal(isOpenDocument({ status: "completed", total: 100 }), true);
  assert.equal(isOpenDocument({ status: "paid", total: 100 }), false);
  assert.equal(isOpenDocument({ status: "cancelled", total: 100 }), false);
});

test("payable and follow-up phrases resolve to financial tools", () => {
  assert.equal(recognizeFinancialIntent("How much do I owe suppliers?"), "total_payables");
  assert.equal(recognizeFinancialIntent("What about last month?", "total_payables"), "total_payables");
  assert.equal(recognizeFinancialIntent("Show the top five suppliers"), "supplier_payables");
  assert.equal(recognizeFinancialIntent("Which ones are overdue?", "total_payables"), "outstanding_purchase_invoices");
  assert.equal(recognizeFinancialIntent("What are my total purchases?"), "purchase_summary");
  assert.equal(recognizeFinancialIntent("What is my current cash balance?"), "cash_balance");
});

test("last-month period is bounded to the previous calendar month", () => {
  const period = resolveAssistantPeriod("last-month", new Date(2026, 9, 13));
  assert.equal(period.start.getFullYear(), 2026);
  assert.equal(period.start.getMonth(), 8);
  assert.equal(period.start.getDate(), 1);
  assert.equal(period.end.getMonth(), 8);
  assert.equal(period.end.getDate(), 30);
});

test("conceptual financial questions stay on the knowledge-base path", () => {
  assert.equal(requestsLiveFinancialData("What does Total Payables mean?"), false);
  assert.equal(requestsLiveFinancialData("How do I view a profit and loss report?"), false);
  assert.equal(requestsLiveFinancialData("What is my Total Payables this month?"), true);
  assert.equal(requestsLiveFinancialData("Explain how payables are calculated and show my current Total Payables."), true);
  assert.equal(recognizeFinancialIntent("What is my Total Payables this month?"), "total_payables");
  assert.equal(recognizeFinancialIntent("Explain how payables are calculated and show my current Total Payables."), "total_payables");
});

test("knowledge base retrieves requested invoice and module workflows", () => {
  const expected = new Map([
    ["Explain how invoice creation works.", "invoice-creation-overview"],
    ["How can I make a bill for my customer?", "sales-invoice-creation"],
    ["How do I create a purchase invoice?", "purchase-invoice-creation"],
    ["Where can I find a saved invoice?", "invoice-find"],
    ["How do I print an invoice PDF?", "invoice-print"],
    ["How do I apply a payment?", "invoice-payment"],
    ["What is the difference between sales and purchase invoices?", "sales-vs-purchase-invoice"],
    ["What does Total Payables mean?", "total-payables-concept"],
    ["How does inventory work?", "inventory-overview"],
    ["How do I view my profit and loss report?", "pnl-report"],
    ["What is cash flow prediction?", "cash-flow-overview"],
    ["Why are my dashboard and AI CFO showing different amounts?", "dashboard-ai-discrepancy"],
    ["Why is my invoice not saving?", "troubleshooting"],
  ]);

  for (const [question, id] of expected) {
    assert.equal(findBestMatch(question)?.record.id, id, question);
  }

  assert.ok(searchKnowledgeBase("How can I make a bill for my customer?", 2).length > 0);
  const record = findBestMatch("How can I make a bill for my customer?")?.record;
  assert.equal(record?.answerType, "application_workflow");
  assert.ok(record?.verificationStatus);
  assert.ok(knowledgeBaseSummary().recordCount >= 19);
});
