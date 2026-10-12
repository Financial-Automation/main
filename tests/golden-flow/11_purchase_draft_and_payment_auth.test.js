import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runPurchaseDraftAndPaymentAuthRegression() {
  console.log("\n========================================================");
  console.log("🔒 PART 14: PURCHASE DRAFT & PAYMENT AUTH REGRESSION");
  console.log("========================================================");

  await ensureServerReady();
  const timestamp = Date.now();

  // Step 1: Create Tenant A and Tenant B
  const tenantAEmail = `tenantA_${timestamp}@example.com`;
  const tenantBEmail = `tenantB_${timestamp}@example.com`;

  const signupA = await request("/signup-trial", { method: "POST" }, {
    email: tenantAEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Tenant A Org",
    role: "admin"
  });
  assert.strictEqual(signupA.status, 201, "Tenant A registration failed");
  const tokenA = signupA.body.token;

  const signupB = await request("/signup-trial", { method: "POST" }, {
    email: tenantBEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Tenant B Org",
    role: "admin"
  });
  assert.strictEqual(signupB.status, 201, "Tenant B registration failed");
  const tokenB = signupB.body.token;

  // Step 2: Tenant A creates an invoice
  console.log("\n1. Testing invoice payment authentication and tenant isolation...");
  const invRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    invoiceNumber: `INV-AUTH-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    businessName: "Tenant A Org",
    customerName: "Client A",
    items: [{ productName: "Service A", quantity: 1, unitPrice: 10000, total: 10000 }],
    subtotal: 10000,
    taxAmount: 0,
    grandTotal: 10000,
    amountPaid: 0,
    balanceDue: 10000
  });
  assert.strictEqual(invRes.status, 201, "Invoice creation failed");
  const invoiceId = invRes.body.invoiceId || invRes.body.invoice._id;

  // 2a. Unauthenticated payment attempt must be rejected with 401
  const unauthPayment = await request(`/invoice/${invoiceId}/payment`, {
    method: "POST"
  }, { amount: 5000 });
  assert.strictEqual(unauthPayment.status, 401, "Unauthenticated payment MUST return HTTP 401");
  console.log("   ✓ Unauthenticated payment rejected with HTTP 401 (Strict Auth Verified)");

  // 2b. Tenant B attempting to pay Tenant A's invoice must be rejected (404/Not Found in tenant scope)
  const crossTenantPayment = await request(`/invoice/${invoiceId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` }
  }, { amount: 5000 });
  assert.strictEqual(crossTenantPayment.status, 404, "Cross-tenant payment MUST be blocked with HTTP 404");
  console.log("   ✓ Cross-tenant payment blocked with HTTP 404 (Tenant Isolation Verified)");

  // Step 3: Purchase Invoice Draft Side-Effect Safeguards
  console.log("\n2. Testing draft purchase invoice safeguards (zero bookkeeping / zero stock pollution)...");
  const draftPurRes = await request("/purchase-invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    supplierName: "Vendor Draft Supplier",
    billNo: `PUR-DRAFT-${timestamp}`,
    billDate: new Date().toISOString(),
    stateOfSupply: "Tamil Nadu",
    status: "draft",
    items: [{
      itemName: `Draft Stock Item ${timestamp}`,
      quantity: 50,
      pricePerUnit: 200,
      amount: 10000
    }],
    total: 10000,
    paid: 0
  });
  assert.strictEqual(draftPurRes.status, 201, "Draft purchase invoice creation failed");
  const draftInvoiceId = draftPurRes.body.invoice._id;

  // 3a. Check that NO automated Bookkeeping entry was created for draft
  const bkAfterDraft = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.strictEqual(bkAfterDraft.status, 200);
  const draftBkEntry = (bkAfterDraft.body.entries || []).find(e => e.referenceId === `purchase_inv_${draftInvoiceId}`);
  assert.strictEqual(draftBkEntry, undefined, "Draft purchase invoice MUST NOT create Bookkeeping entry");
  console.log("   ✓ Draft purchase invoice did NOT create Bookkeeping entry (Draft Safeguard Verified)");

  // 3b. Check that stock item was NOT added for draft
  const invAfterDraft = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.strictEqual(invAfterDraft.status, 200);
  const draftItemsList = Array.isArray(invAfterDraft.body) ? invAfterDraft.body : (invAfterDraft.body.items || []);
  const draftStockItem = draftItemsList.find(i => i.itemName === `Draft Stock Item ${timestamp}`);
  assert.strictEqual(draftStockItem, undefined, "Draft purchase invoice MUST NOT create Inventory stock item");
  console.log("   ✓ Draft purchase invoice did NOT add Inventory stock (Draft Safeguard Verified)");

  // Step 4: Non-Draft Purchase Invoice Side-Effects
  console.log("\n3. Testing non-draft purchase invoice execution (bookkeeping + vendor + stock sync)...");
  const completedPurRes = await request("/purchase-invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    supplierName: "Vendor Real Supplier",
    billNo: `PUR-REAL-${timestamp}`,
    billDate: new Date().toISOString(),
    stateOfSupply: "Tamil Nadu",
    status: "completed",
    items: [{
      itemName: `Real Stock Item ${timestamp}`,
      quantity: 25,
      pricePerUnit: 400,
      amount: 10000
    }],
    total: 10000,
    paid: 3000
  });
  assert.strictEqual(completedPurRes.status, 201, "Completed purchase invoice creation failed");
  const completedInvoiceId = completedPurRes.body.invoice._id;

  // 4a. Check that automated Bookkeeping entry was created
  const bkAfterReal = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const realBkEntry = (bkAfterReal.body.entries || []).find(e => e.referenceId === `purchase_inv_${completedInvoiceId}`);
  assert.ok(realBkEntry, "Completed purchase invoice MUST create Bookkeeping entry");
  assert.strictEqual(realBkEntry.amount, 10000, "Bookkeeping amount should equal purchase invoice total");
  console.log("   ✓ Completed purchase invoice created Bookkeeping entry (₹10,000)");

  // 4b. Check that Inventory stock item was created
  const invAfterReal = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const realItemsList = Array.isArray(invAfterReal.body) ? invAfterReal.body : (invAfterReal.body.items || []);
  const realStockItem = realItemsList.find(i => i.itemName === `Real Stock Item ${timestamp}`);
  assert.ok(realStockItem, "Completed purchase invoice MUST create Inventory stock item");
  assert.strictEqual(realStockItem.quantity, 25, "Inventory quantity should be 25");
  console.log("   ✓ Completed purchase invoice created Inventory stock item (25 units)");

  // 4c. Check that Vendor document was created with outstanding payable (10,000 - 3,000 = 7,000)
  const vendorRes = await request("/vendors", {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const vendorsList = Array.isArray(vendorRes.body) ? vendorRes.body : (vendorRes.body.vendors || []);
  const realVendor = vendorsList.find(v => v.name === "Vendor Real Supplier");
  assert.ok(realVendor, "Vendor document should be auto-created");
  assert.strictEqual(realVendor.outstandingPayable, 7000, "Vendor outstanding payable should equal ₹7,000 (10,000 - 3,000 paid)");
  console.log("   ✓ Vendor auto-synced with outstanding payable of ₹7,000");

  console.log("\n✅ PURCHASE DRAFT & PAYMENT AUTH REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("11_purchase_draft_and_payment_auth.test.js")) {
  runPurchaseDraftAndPaymentAuthRegression().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  });
}
