import test from "node:test";
import assert from "node:assert/strict";
import { outstandingBalance, isOpenDocument, recognizeFinancialIntent, resolveAssistantPeriod } from "../utils/financialAssistant.js";

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
