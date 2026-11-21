import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import express from "express";
import aiRoutes, { getGenAI } from "../routes/aiRoutes.js";
import User from "../models/User.js";
import Invoice from "../models/Invoice.js";
import { getPurchaseInvoiceModel } from "../utils/financialTools.js";

let mongod;
let app;
let server;
let serverPort;
let authToken;
const testUserId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Seed test user
  await User.create({
    _id: testUserId,
    email: "cfo_test@saaiss.in",
    password: "Password123!",
    name: "SaaISS Test Owner",
    sellerName: "SaaISS Solutions Pvt Ltd",
    sellerGSTIN: "33AAAAA0000A1Z5",
    role: "admin",
  });

  const now = new Date();
  const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 10);

  // Seed Invoice
  await Invoice.create({
    userId: testUserId,
    businessName: "SaaISS Enterprise",
    customerName: "Acme Corp",
    invoiceNumber: "INV-2026-999",
    invoiceDate: thisMonthDate,
    subtotal: 42372.88,
    taxAmount: 7627.12,
    grandTotal: 50000,
    amountPaid: 20000,
    balanceDue: 30000,
    status: "sent",
    paymentStatus: "partial",
  });

  // Seed Purchase
  const PurchaseInvoice = getPurchaseInvoiceModel();
  await PurchaseInvoice.create({
    userId: testUserId,
    supplierName: "Vendor X",
    billNo: "BILL-2026-999",
    total: 25000,
    balance: 15000,
    status: "pending",
    billDate: thisMonthDate,
  });

  const secret = process.env.JWT_SECRET || "0069cff5788a79456b669c22226ae865030898099c7b76467ae1cbdf12cdbea29a4fb839215600cb3af802cde900104e85ce421ff2a02a33920282359c3825c4";
  authToken = jwt.sign(
    { id: testUserId.toString(), email: "cfo_test@saaiss.in", role: "admin" },
    secret,
    { expiresIn: "1h" }
  );

  app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) await new Promise((res) => server.close(res));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("Direct Gemini LLM Test 1: General question gets direct, intelligent response", async () => {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/ai/cfo-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      history: [{ role: "user", content: "What is working capital and why is it important for a business?" }],
      period: "this-month",
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.reply, "Must return reply");
  assert.match(data.reply, /working capital/i, "Reply must directly address working capital");
  assert.doesNotMatch(data.reply, /I can currently retrieve payables, receivables/i, "Must not return canned refusal");
});

test("Direct Gemini LLM Test 2: Financial query cites exact live business numbers", async () => {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/ai/cfo-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      history: [{ role: "user", content: "What is my Total Payables this month?" }],
      period: "this-month",
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.reply, "Must return reply");
  assert.match(data.reply, /15,000|payables/i, "Must accurately reference the live payables");
});

test("Direct Gemini LLM Test 3: Application workflow returns clear steps", async () => {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/ai/cfo-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      history: [{ role: "user", content: "How do I create a sales invoice in the system?" }],
      period: "this-month",
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.reply, "Must return reply");
  assert.match(data.reply, /invoice|sales|customer/i, "Must explain invoice creation workflow");
});
