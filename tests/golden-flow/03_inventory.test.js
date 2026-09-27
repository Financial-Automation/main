import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runInventoryRegression() {
  console.log("\n==========================================");
  console.log("📦 PART 6: INVENTORY REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `inventory_test_${timestamp}@example.com`;

  // Step 1: Create user account
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Inventory Test Business",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");
  const token = signupRes.body.token;

  // Step 2: Create initial inventory item
  console.log("\n1. Creating initial inventory item...");
  const sku = `SKU-${timestamp}`;
  const createRes = await request("/inventory/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    itemName: "Standard Widget A",
    sku: sku,
    category: "Hardware",
    quantity: 100,
    price: 250,
    costPrice: 150
  });

  assert.strictEqual(createRes.status, 201, `Create item failed with status ${createRes.status}`);
  assert.ok(createRes.body.item?._id, "Item ID must be returned");
  const itemId = createRes.body.item._id;
  assert.strictEqual(createRes.body.item.quantity, 100, "Initial stock quantity must be 100");
  console.log(`   ✓ Item '${sku}' created with stock: 100`);

  // Step 3: Duplicate SKU / Validation test
  console.log("\n2. Testing invalid item field handling...");
  const invalidRes = await request("/inventory/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    sku: `INVALID-${timestamp}`,
    quantity: 50
    // Missing required itemName and price
  });
  assert.strictEqual(invalidRes.status, 500, "Missing required fields must fail with error");
  console.log("   ✓ Invalid item creation correctly rejected");

  // Step 4: OTC / Sell item test (Stock Reduction & Bookkeeping Entry Generation)
  console.log("\n3. Testing sale stock reduction & accounting propagation...");
  const sellRes = await request(`/inventory/sell/${itemId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    quantitySold: 10,
    stateOfSupply: "Tamil Nadu"
  });
  assert.strictEqual(sellRes.status, 200, "Sale item should return HTTP 200");
  assert.strictEqual(sellRes.body.item.quantity, 90, "Stock after selling 10 units must be 90");
  console.log("   ✓ Stock reduced from 100 to 90 upon selling 10 units.");

  // Step 5: Verify Stock Consistency across GET /inventory/all
  console.log("\n4. Verifying stock consistency via GET /inventory/all...");
  const listRes = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(listRes.status, 200, "Fetch inventory list should return 200");
  const itemsList = Array.isArray(listRes.body) ? listRes.body : (listRes.body.items || []);
  const fetchedItem = itemsList.find(i => i._id === itemId || i.sku === sku);
  assert.ok(fetchedItem, "Created item must be present in inventory list");
  assert.strictEqual(fetchedItem.quantity, 90, "Item quantity in database list must match 90");
  console.log("   ✓ Inventory stock consistency verified in DB list (90 units)");

  // Step 6: Test Reserve & Restore stock endpoints (for Invoice flow)
  console.log("\n5. Testing reserve and restore stock endpoints...");
  const reserveRes = await request(`/inventory/reserve/${itemId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, { quantity: 15 });
  assert.strictEqual(reserveRes.status, 200, "Reserve stock should return HTTP 200");
  assert.strictEqual(reserveRes.body.remainingStock, 75, "Remaining stock after reserving 15 should be 75");

  const restoreRes = await request(`/inventory/restore/${itemId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, { quantity: 15 });
  assert.strictEqual(restoreRes.status, 200, "Restore stock should return HTTP 200");
  assert.strictEqual(restoreRes.body.currentStock, 90, "Stock after restoring 15 should be back to 90");
  console.log("   ✓ Reserve and restore stock operations verified successfully.");

  // Step 7: Item Deletion Test
  console.log("\n6. Testing item deletion...");
  const deleteRes = await request(`/inventory/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(deleteRes.status, 200, "Delete item should return status 200");

  const listAfterDelete = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const itemsAfterDelete = Array.isArray(listAfterDelete.body) ? listAfterDelete.body : (listAfterDelete.body.items || []);
  const deletedItemCheck = itemsAfterDelete.find(i => i._id === itemId);
  assert.strictEqual(deletedItemCheck, undefined, "Deleted item must no longer exist in inventory list");
  console.log("   ✓ Item successfully deleted and removed from active list");

  console.log("\n✅ INVENTORY REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("03_inventory.test.js")) {
  runInventoryRegression().catch(err => {
    console.error("❌ Inventory Regression Failed:", err);
    process.exit(1);
  });
}
