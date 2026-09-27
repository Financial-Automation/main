import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runDataIsolationRegression() {
  console.log("\n==========================================");
  console.log("🔐 PART 11: DATA ISOLATION REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();

  // Create Company A
  const emailA = `compA_${timestamp}@example.com`;
  console.log(`\n1. Creating Company A (${emailA})...`);
  const regA = await request("/signup-trial", { method: "POST" }, {
    email: emailA,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Company Alpha",
    role: "admin"
  });
  assert.strictEqual(regA.status, 201, "Company A creation failed");
  const tokenA = regA.body.token;

  // Create Company B
  const emailB = `compB_${timestamp}@example.com`;
  console.log(`2. Creating Company B (${emailB})...`);
  const regB = await request("/signup-trial", { method: "POST" }, {
    email: emailB,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Company Beta",
    role: "admin"
  });
  assert.strictEqual(regB.status, 201, "Company B creation failed");
  const tokenB = regB.body.token;

  // Step 3: Company A creates sensitive financial data
  console.log("\n3. Company A creates Inventory Item & Invoice for ₹150,000...");
  const skuA = `SKU-COMPA-${timestamp}`;
  const invItemA = await request("/inventory/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    itemName: "Alpha Secret Asset",
    sku: skuA,
    quantity: 500,
    price: 300
  });
  assert.strictEqual(invItemA.status, 201, "Company A item creation failed");

  const invA = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    invoiceNumber: `INV-ALPHA-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Company Alpha",
    customerName: "Alpha Customer",
    items: [{ productName: "Confidential Service", quantity: 1, unitPrice: 150000, total: 150000 }],
    subtotal: 150000,
    taxAmount: 0,
    grandTotal: 150000,
    amountPaid: 150000,
    balanceDue: 0
  });
  assert.strictEqual(invA.status, 201, "Company A invoice creation failed");
  const invoiceIdA = invA.body.invoiceId || invA.body.invoice._id;

  // Step 4: Verify Company B queries inventory & invoices
  console.log("\n4. Verifying Company B CANNOT access Company A's inventory or invoices via API...");

  const compBInventory = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.strictEqual(compBInventory.status, 200);
  const compBItems = Array.isArray(compBInventory.body) ? compBInventory.body : (compBInventory.body.items || []);
  const leakedItem = compBItems.find(item => item.sku === skuA);
  assert.strictEqual(leakedItem, undefined, "Company B MUST NOT see Company A's inventory items!");
  console.log("   ✓ Inventory Data Isolation Verified: Company B sees 0 items from Company A");

  const compBInvoices = await request("/invoice/all?limit=100", {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.strictEqual(compBInvoices.status, 200);
  const compBInvList = compBInvoices.body.invoices || [];
  const leakedInv = compBInvList.find(inv => inv._id === invoiceIdA || inv.invoiceNumber === `INV-ALPHA-${timestamp}`);
  assert.strictEqual(leakedInv, undefined, "Company B MUST NOT see Company A's invoices!");
  console.log("   ✓ Invoice Data Isolation Verified: Company B sees 0 invoices from Company A");

  // Step 5: Verify Company B cannot access Company A's direct single invoice endpoint
  console.log("\n5. Testing direct single-resource fetch cross-tenant isolation...");
  const singleInvB = await request(`/invoice/${invoiceIdA}`, {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.strictEqual(singleInvB.status, 404, "Direct request by Company B for Company A's invoice must return 404 Not Found");
  console.log("   ✓ Single Resource Cross-Tenant Access Blocked with 404 Not Found");

  // Step 6: Verify Company B's Bookkeeping & Financial Statements are isolated
  console.log("\n6. Verifying Bookkeeping & P&L isolation for Company B...");
  const bkB = await request("/bookkeeping/all", {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const entriesB = bkB.body.entries || [];
  const leakedBk = entriesB.find(e => e.referenceId === `invoice_${invoiceIdA}`);
  assert.strictEqual(leakedBk, undefined, "Company B MUST NOT see Company A's bookkeeping records!");
  console.log("   ✓ Bookkeeping Isolation Verified: Company B has 0 entries from Company A");

  const plB = await request("/profitloss/generate?period=this-month", {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.strictEqual(plB.body.totalRevenue, 0, "Company B's P&L revenue must be 0 (isolated from Company A's ₹150,000)");
  console.log("   ✓ Financial Statements Isolation Verified: Company B revenue is ₹0");

  console.log("\n✅ DATA ISOLATION REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("08_data_isolation.test.js")) {
  runDataIsolationRegression().catch(err => {
    console.error("❌ Data Isolation Regression Failed:", err);
    process.exit(1);
  });
}
