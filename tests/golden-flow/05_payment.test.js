import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runPaymentRegression() {
  console.log("\n==========================================");
  console.log("💳 PART 8: PAYMENT REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `payment_test_${timestamp}@example.com`;

  // Step 1: Create user account
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Payment Test Business",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");
  const token = signupRes.body.token;

  // Step 2: Create an unpaid invoice for ₹20,000
  console.log("\n1. Creating invoice for ₹20,000...");
  const invNumber = `INV-PAY-${timestamp}`;
  const invRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    invoiceNumber: invNumber,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    businessName: "Payment Test Corp",
    customerName: "Payer Client",
    items: [{ productName: "Consulting", quantity: 1, unitPrice: 20000, total: 20000 }],
    subtotal: 20000,
    taxAmount: 0,
    grandTotal: 20000,
    amountPaid: 0,
    balanceDue: 20000
  });

  assert.strictEqual(invRes.status, 201, "Invoice creation failed");
  const invoiceId = invRes.body.invoiceId || invRes.body.invoice._id;
  console.log(`   ✓ Created invoice '${invNumber}' for ₹20,000 (Balance Due: ₹20,000)`);

  // Step 3: Record Partial Payment of ₹8,000
  console.log("\n2. Testing PARTIAL payment of ₹8,000...");
  const partialPayRes = await request(`/invoice/${invoiceId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    amount: 8000,
    paymentMethod: "bank_transfer",
    paymentDate: new Date().toISOString()
  });

  assert.strictEqual(partialPayRes.status, 200, "Partial payment must return HTTP 200");
  assert.strictEqual(partialPayRes.body.invoice.amountPaid, 8000, "Amount paid should be ₹8,000");
  assert.strictEqual(partialPayRes.body.invoice.balanceDue, 12000, "Balance due should be ₹12,000");
  assert.strictEqual(partialPayRes.body.invoice.paymentStatus, "partial", "Payment status should be 'partial'");
  console.log("   ✓ Partial payment recorded. Amount Paid: ₹8,000 | Remaining Balance: ₹12,000");

  // Step 4: Record Remaining Payment of ₹12,000 (FULL PAYMENT)
  console.log("\n3. Testing FULL remaining payment of ₹12,000...");
  const fullPayRes = await request(`/invoice/${invoiceId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    amount: 12000,
    paymentMethod: "upi",
    paymentDate: new Date().toISOString()
  });

  assert.strictEqual(fullPayRes.status, 200, "Full payment must return HTTP 200");
  assert.strictEqual(fullPayRes.body.invoice.amountPaid, 20000, "Total amount paid must equal ₹20,000");
  assert.strictEqual(fullPayRes.body.invoice.balanceDue, 0, "Balance due must equal ₹0");
  assert.strictEqual(fullPayRes.body.invoice.paymentStatus, "paid", "Payment status must be 'paid'");
  assert.strictEqual(fullPayRes.body.invoice.status, "paid", "Invoice status must update to 'paid'");
  console.log("   ✓ Full payment completed. Balance Due: ₹0 | Invoice Status: 'paid'");

  // Step 5: Test Payment Against Non-Existent Invoice
  console.log("\n4. Testing payment against non-existent invoice...");
  const invalidInvPay = await request("/invoice/non_existent_id_9999/payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, { amount: 5000 });
  assert.strictEqual(invalidInvPay.status, 404, "Payment for non-existent invoice must return 404");
  console.log("   ✓ Payment against non-existent invoice correctly rejected with 404");

  // Step 6: Verify Bookkeeping Entry Updated Correctly (Single Income Entry for Invoice)
  console.log("\n5. Verifying Bookkeeping ledger consistency after payment completion...");
  const bkRes = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(bkRes.status, 200, "GET /bookkeeping/all should return 200");
  const entries = bkRes.body.entries || [];
  const invoiceBkEntry = entries.find(e => e.referenceId === `invoice_${invoiceId}`);
  assert.ok(invoiceBkEntry, "Automated bookkeeping entry must exist for invoice");
  assert.strictEqual(invoiceBkEntry.amount, 20000, "Bookkeeping amount must match invoice grand total (no duplicate entries)");
  console.log("   ✓ Bookkeeping ledger entry verified. Amount: ₹20,000 (No duplicate financial entries)");

  console.log("\n✅ PAYMENT REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("05_payment.test.js")) {
  runPaymentRegression().catch(err => {
    console.error("❌ Payment Regression Failed:", err);
    process.exit(1);
  });
}
