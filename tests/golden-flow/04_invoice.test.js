import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runInvoiceRegression() {
  console.log("\n==========================================");
  console.log("📄 PART 7: INVOICE REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `invoice_test_${timestamp}@example.com`;

  // Step 1: Create user account
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Invoice Test Business",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");
  const token = signupRes.body.token;

  // Step 2: Create valid invoice
  console.log("\n1. Testing invoice creation & financial calculations...");
  const invNumber = `INV-${timestamp}`;
  const subtotal = 10000;
  const taxAmount = 1800; // 18% GST
  const grandTotal = 11800;

  const createRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    invoiceNumber: invNumber,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    businessName: "Acme Business Solutions",
    customerName: "Global Client Inc",
    customerEmail: "client@global.com",
    items: [{
      productName: "Software Development Services",
      quantity: 1,
      unitPrice: 10000,
      taxRate: 18,
      total: 10000
    }],
    subtotal: subtotal,
    taxAmount: taxAmount,
    grandTotal: grandTotal,
    amountPaid: 0,
    balanceDue: grandTotal,
    sgst: 900,
    cgst: 900,
    igst: 0
  });

  assert.strictEqual(createRes.status, 201, `Invoice creation failed with status ${createRes.status}`);
  assert.ok(createRes.body.invoiceId || createRes.body.invoice?._id, "Invoice ID must be returned");
  const invoiceId = createRes.body.invoiceId || createRes.body.invoice._id;
  assert.strictEqual(createRes.body.invoice.grandTotal, 11800, "Grand total must equal 11800");
  assert.strictEqual(createRes.body.invoice.balanceDue, 11800, "Initial balance due must equal grand total");
  console.log(`   ✓ Invoice '${invNumber}' created. Subtotal: ₹10,000 | Tax: ₹1,800 | Grand Total: ₹11,800`);

  // Step 3: Duplicate invoice number test
  console.log("\n2. Testing duplicate invoice number protection...");
  const dupRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    invoiceNumber: invNumber,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Acme Business Solutions",
    customerName: "Duplicate Test Customer",
    items: [{ productName: "Item", quantity: 1, unitPrice: 1000, total: 1000 }],
    subtotal: 1000,
    taxAmount: 0,
    grandTotal: 1000,
    balanceDue: 1000
  });
  assert.strictEqual(dupRes.status, 400, "Duplicate invoice number must return status 400");
  console.log("   ✓ Duplicate invoice number correctly rejected with status 400");

  // Step 4: Verify Invoice List (GET /invoice/all)
  console.log("\n3. Verifying invoice retrieval via GET /invoice/all...");
  const listRes = await request("/invoice/all?limit=20", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(listRes.status, 200, "GET /invoice/all must return 200");
  const fetchedInvoice = listRes.body.invoices?.find(inv => inv.invoiceNumber === invNumber || inv._id === invoiceId);
  assert.ok(fetchedInvoice, "Created invoice must be in list");
  console.log("   ✓ Invoice verified in database list query");

  // Step 5: Update Invoice Status (PATCH /invoice/:id/status)
  console.log("\n4. Testing invoice status update...");
  const statusRes = await request(`/invoice/${invoiceId}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  }, { status: "sent" });
  assert.strictEqual(statusRes.status, 200, "Status update must return HTTP 200");
  assert.strictEqual(statusRes.body.invoice.status, "sent", "Invoice status must update to 'sent'");
  console.log("   ✓ Invoice status updated to 'sent'");

  // Step 6: Soft Delete / Cancel Invoice (DELETE /invoice/:id)
  console.log("\n5. Testing invoice soft deletion & cancellation propagation...");
  const deleteRes = await request(`/invoice/${invoiceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(deleteRes.status, 200, "Delete invoice must return HTTP 200");

  const listAfterDelete = await request("/invoice/all?limit=20", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const deletedCheck = listAfterDelete.body.invoices?.find(inv => inv._id === invoiceId);
  assert.strictEqual(deletedCheck, undefined, "Soft-deleted invoice must be excluded from active invoice list");
  console.log("   ✓ Invoice soft-deleted and removed from active lists");

  console.log("\n✅ INVOICE REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("04_invoice.test.js")) {
  runInvoiceRegression().catch(err => {
    console.error("❌ Invoice Regression Failed:", err);
    process.exit(1);
  });
}
