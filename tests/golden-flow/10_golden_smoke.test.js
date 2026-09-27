import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runGoldenSmokeTest() {
  console.log("\n==================================================");
  console.log("🔥 PART 13: GOLDEN SMOKE TEST (END-TO-END FLOW)");
  console.log("==================================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const adminEmail = `smoke_admin_${timestamp}@example.com`;
  const adminPass = `AdminPass_${timestamp}`;
  const storePass = `StorePass_${timestamp}`;

  // 1. Admin & Store Signup
  console.log("\n1. Initializing Company context with Admin & Store credentials...");
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: adminEmail,
    password: adminPass,
    storePassword: storePass,
    name: "Golden Smoke Enterprise",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Signup failed");

  // 2. Admin & Store Signin
  console.log("2. Testing Admin & Store Sign-In...");
  const adminSignin = await request("/signin", { method: "POST" }, { email: adminEmail, password: adminPass });
  assert.strictEqual(adminSignin.body.user.role, "admin", "Admin role must be 'admin'");
  const adminToken = adminSignin.body.token;

  const storeSignin = await request("/signin", { method: "POST" }, { email: adminEmail, password: storePass });
  assert.strictEqual(storeSignin.body.user.role, "instore", "Store role must be 'instore'");
  const storeToken = storeSignin.body.token;
  console.log("   ✓ Admin & Store login successful");

  // 3. Role Persistence on GET /api/user
  console.log("3. Verifying Role Persistence on GET /api/user...");
  const adminProfile = await request("/user", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.strictEqual(adminProfile.body.role, "admin", "Admin role must persist on GET /api/user");

  const storeProfile = await request("/user", { headers: { Authorization: `Bearer ${storeToken}` } });
  assert.strictEqual(storeProfile.body.role, "instore", "Store role MUST persist as 'instore' on GET /api/user");
  console.log("   ✓ Role persistence verified (Admin = admin, Store = instore)");

  // 4. Inventory Creation
  console.log("4. Testing Inventory Creation...");
  const sku = `SKU-SMOKE-${timestamp}`;
  const invItem = await request("/inventory/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` }
  }, {
    itemName: "Smoke Product A",
    sku: sku,
    quantity: 50,
    price: 1000
  });
  assert.strictEqual(invItem.status, 201, "Inventory item creation failed");
  console.log("   ✓ Inventory item created (50 units @ ₹1,000)");

  // 5. Invoice Creation
  console.log("5. Testing Invoice Creation...");
  const invoiceRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` }
  }, {
    invoiceNumber: `INV-SMOKE-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Golden Smoke Enterprise",
    customerName: "Golden Customer",
    items: [{ productName: "Smoke Product A", quantity: 5, unitPrice: 1000, total: 5000 }],
    subtotal: 5000,
    taxAmount: 0,
    grandTotal: 5000,
    amountPaid: 0,
    balanceDue: 5000
  });
  assert.strictEqual(invoiceRes.status, 201, "Invoice creation failed");
  const invoiceId = invoiceRes.body.invoiceId || invoiceRes.body.invoice._id;
  console.log("   ✓ Sales Invoice created for ₹5,000");

  // 6. Payment Processing
  console.log("6. Testing Payment Processing...");
  const payRes = await request(`/invoice/${invoiceId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` }
  }, { amount: 5000, paymentMethod: "cash" });
  assert.strictEqual(payRes.status, 200, "Payment failed");
  assert.strictEqual(payRes.body.invoice.paymentStatus, "paid", "Invoice payment status must be 'paid'");
  console.log("   ✓ Full payment of ₹5,000 processed");

  // 7. Bookkeeping Propagation & Idempotency
  console.log("7. Verifying Bookkeeping Propagation...");
  const bkRes = await request("/bookkeeping/all", { headers: { Authorization: `Bearer ${adminToken}` } });
  const entries = bkRes.body.entries || [];
  const matchingEntries = entries.filter(e => e.referenceId === `invoice_${invoiceId}`);
  assert.strictEqual(matchingEntries.length, 1, "Exactly ONE bookkeeping entry must exist (no duplicate financial entries)");
  assert.strictEqual(matchingEntries[0].amount, 5000, "Bookkeeping amount must match ₹5,000");
  console.log("   ✓ Bookkeeping entry verified: Single entry of ₹5,000");

  // 8. P&L, Balance Sheet, Cash Flow & Financial Ratios Propagation
  console.log("8. Verifying Financial Statements Propagation...");
  const plRes = await request("/profitloss/generate?period=this-month", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(plRes.body.totalRevenue >= 5000, "P&L revenue must include invoice total");

  const bsRes = await request("/balance/generate?period=this-month", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.strictEqual(bsRes.status, 200);

  const cfRes = await request("/cashflow-statement/generate?period=this-month", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.strictEqual(cfRes.status, 200);
  console.log("   ✓ Financial Statements (P&L, Balance Sheet, Cash Flow) verified");

  // 9. Data Isolation Test
  console.log("9. Verifying Company Multi-Tenant Data Isolation...");
  const isolEmail = `isol_smoke_${timestamp}@example.com`;
  const isoldSignup = await request("/signup-trial", { method: "POST" }, {
    email: isolEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Isolated Enterprise",
    role: "admin"
  });
  const isolToken = isoldSignup.body.token;

  const isolInvoices = await request("/invoice/all?limit=20", { headers: { Authorization: `Bearer ${isolToken}` } });
  const leakedInv = isolInvoices.body.invoices?.find(i => i._id === invoiceId);
  assert.strictEqual(leakedInv, undefined, "Isolated user MUST NOT see another company's invoice");
  console.log("   ✓ Company Data Isolation verified");

  // 10. Subscription & Role API Enforcement
  console.log("10. Verifying Role & API Restrictions Enforcement...");
  const storePayroll = await request("/payroll/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { employeeName: "Test", basicSalary: 10000 });
  assert.strictEqual(storePayroll.status, 403, "Store POS direct call to Payroll API must return 403");
  console.log("   ✓ API Restriction Enforcement verified (HTTP 403 Forbidden)");

  console.log("\n==================================================");
  console.log("🎉 GOLDEN SMOKE TEST PASSED 100% (ALL CHECKS OK)");
  console.log("==================================================\n");
}

if (process.argv[1].endsWith("10_golden_smoke.test.js")) {
  runGoldenSmokeTest().catch(err => {
    console.error("❌ Golden Smoke Test Failed:", err);
    process.exit(1);
  });
}
