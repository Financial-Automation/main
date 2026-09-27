import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runBookkeepingRegression() {
  console.log("\n==========================================");
  console.log("📚 PART 9: BOOKKEEPING REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `bookkeeping_test_${timestamp}@example.com`;

  // Step 1: Create user account
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Bookkeeping Test Corp",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");
  const token = signupRes.body.token;

  // Step 2: Create Sales Invoice (triggers automated Bookkeeping Income Entry)
  console.log("\n1. Testing automated Bookkeeping propagation from Sales Invoice creation...");
  const invNumber = `INV-BK-${timestamp}`;
  const invRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    invoiceNumber: invNumber,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Bookkeeping Test Corp",
    customerName: "Audited Client",
    items: [{ productName: "Audit Consulting", quantity: 1, unitPrice: 50000, total: 50000 }],
    subtotal: 50000,
    taxAmount: 0,
    grandTotal: 50000,
    amountPaid: 50000,
    balanceDue: 0
  });

  assert.strictEqual(invRes.status, 201, "Invoice creation failed");
  const invoiceId = invRes.body.invoiceId || invRes.body.invoice._id;
  console.log(`   ✓ Created invoice '${invNumber}' for ₹50,000`);

  // Verify Bookkeeping Entry exists
  const bkList1 = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(bkList1.status, 200, "Fetch bookkeeping list must return 200");
  const entries1 = bkList1.body.entries || [];
  const bkEntry = entries1.find(e => e.referenceId === `invoice_${invoiceId}`);
  assert.ok(bkEntry, "Bookkeeping entry must be automatically created for invoice");
  assert.strictEqual(bkEntry.amount, 50000, "Bookkeeping amount must equal ₹50,000");
  assert.strictEqual(bkEntry.type, "income", "Bookkeeping entry type must be 'income'");
  console.log("   ✓ Automated Bookkeeping entry verified: ₹50,000 (Type: income)");

  // Step 3: Test Idempotency & Update Propagation (Updating invoice amount)
  console.log("\n2. Testing Idempotency & Update Propagation...");
  const updateInvRes = await request(`/invoice/${invoiceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    grandTotal: 60000,
    subtotal: 60000,
    balanceDue: 10000,
    amountPaid: 50000
  });
  assert.strictEqual(updateInvRes.status, 200, "Update invoice should return HTTP 200");

  const bkList2 = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const entries2 = bkList2.body.entries || [];
  const matchingEntries = entries2.filter(e => e.referenceId === `invoice_${invoiceId}`);
  assert.strictEqual(matchingEntries.length, 1, "Idempotency check: Exactly ONE bookkeeping entry must exist (no duplicate entries)");
  assert.strictEqual(matchingEntries[0].amount, 60000, "Bookkeeping entry amount must update to ₹60,000");
  console.log("   ✓ Idempotency & update propagation verified: Single entry updated to ₹60,000");

  // Step 4: Test Deletion / Cancellation Propagation
  console.log("\n3. Testing Delete / Reversal Propagation...");
  const deleteInvRes = await request(`/invoice/${invoiceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(deleteInvRes.status, 200, "Delete invoice should return HTTP 200");

  const bkList3 = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const entries3 = bkList3.body.entries || [];
  const bkEntryAfterDelete = entries3.find(e => e.referenceId === `invoice_${invoiceId}`);
  assert.strictEqual(bkEntryAfterDelete, undefined, "Bookkeeping entry must be removed upon invoice soft-delete/cancellation");
  console.log("   ✓ Delete propagation verified: Automated bookkeeping entry removed");

  console.log("\n✅ BOOKKEEPING REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("06_bookkeeping.test.js")) {
  runBookkeepingRegression().catch(err => {
    console.error("❌ Bookkeeping Regression Failed:", err);
    process.exit(1);
  });
}
