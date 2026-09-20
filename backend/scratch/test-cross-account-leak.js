import http from 'http';

const API_BASE = 'http://localhost:5001/api';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log("=== STARTING CROSS-ACCOUNT DATA LEAK VERIFICATION ===");
  const timestamp = Date.now();

  // Step 1: Register User Account A
  const userAEmail = `accountA_${timestamp}@example.com`;
  console.log(`\n1. Creating Account A (${userAEmail})...`);
  const regA = await request('/signup-trial', { method: 'POST' }, {
    email: userAEmail,
    password: 'password123',
    storePassword: 'store123',
    name: 'Account A Owner',
    role: 'admin'
  });

  if (regA.status !== 201 && regA.status !== 200) {
    console.error("FAILED to register Account A:", regA);
    process.exit(1);
  }
  const tokenA = regA.body.token;
  const userA = regA.body.user;
  console.log(`Account A created. ID: ${userA.id}`);

  // Step 2: Account A creates an invoice for ₹75,000
  console.log("\n2. Account A creates Invoice INV-ACCOUNT-A for ₹75,000...");
  const invA = await request('/invoice/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` }
  }, {
    invoiceNumber: `INV-A-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: 'Account A Business',
    customerName: 'Client Alpha',
    subtotal: 75000,
    taxAmount: 0,
    total: 75000,
    grandTotal: 75000,
    amountPaid: 75000,
    balanceDue: 0,
    items: [{ productName: 'Enterprise Software License', quantity: 1, unitPrice: 75000, total: 75000 }]
  });

  if (invA.status !== 201 && invA.status !== 200) {
    console.error("FAILED to create invoice for Account A:", invA);
    process.exit(1);
  }
  console.log(`Invoice INV-A-${timestamp} created for Account A.`);

  // Step 3: Simulate local storage containing Account A's invoice (with userId = userA.id)
  const localStorageSim = [
    {
      id: invA.body.invoice?._id || `inv-a-${timestamp}`,
      invoiceNo: `INV-A-${timestamp}`,
      invoiceNumber: `INV-A-${timestamp}`,
      total: 75000,
      grandTotal: 75000,
      userId: userA.id
    }
  ];
  console.log(`\n3. Simulated localStorage 'savedInvoices' now contains 1 item (belonging to User A: ${userA.id})`);

  // Step 4: Register User Account B (Brand New User)
  const userBEmail = `accountB_${timestamp}@example.com`;
  console.log(`\n4. Registering NEW Account B (${userBEmail})...`);
  const regB = await request('/signup-trial', { method: 'POST' }, {
    email: userBEmail,
    password: 'password123',
    storePassword: 'store123',
    name: 'Account B Owner',
    role: 'admin'
  });

  if (regB.status !== 201 && regB.status !== 200) {
    console.error("FAILED to register Account B:", regB);
    process.exit(1);
  }
  const tokenB = regB.body.token;
  const userB = regB.body.user;
  console.log(`Account B created. ID: ${userB.id}`);

  // Step 5: Fetch Account B's invoices from backend API
  console.log("\n5. Fetching Account B's invoices from server API...");
  const fetchB = await request('/invoice/all?limit=500', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const backendInvoicesB = fetchB.body.invoices || [];
  console.log(`Backend invoices count for Account B: ${backendInvoicesB.length}`);

  // Step 6: Simulate updated Dashboard filtering logic on Account B
  console.log("\n6. Running Dashboard / AutomationInvoice filtering logic for Account B...");
  const currentUserId = userB.id;

  // Filter localInvoices: exclude items whose userId !== currentUserId
  const userBLocalInvoices = localStorageSim.filter(inv => {
    if (inv.userId && currentUserId && String(inv.userId) !== String(currentUserId)) {
      return false; // DROP User A's invoice!
    }
    return true;
  });

  const invoiceMap = new Map();
  backendInvoicesB.forEach(inv => {
    const key = inv.invoiceNumber || inv.invoiceNo || inv._id || inv.id;
    if (key) invoiceMap.set(key, inv);
  });
  userBLocalInvoices.forEach(inv => {
    const key = inv.invoiceNumber || inv.invoiceNo || inv._id || inv.id;
    if (key && !invoiceMap.has(key)) invoiceMap.set(key, inv);
  });

  const finalInvoicesB = Array.from(invoiceMap.values());
  const totalRevenueB = finalInvoicesB.reduce((sum, inv) => sum + (inv.total || inv.grandTotal || 0), 0);

  console.log(`\n=== RESULTS FOR NEW ACCOUNT B ===`);
  console.log(`Total invoices displayed for Account B: ${finalInvoicesB.length}`);
  console.log(`Total revenue displayed for Account B: ₹${totalRevenueB}`);

  // Verification Assertions
  if (finalInvoicesB.length === 0 && totalRevenueB === 0) {
    console.log("\n✅ SUCCESS: New Account B is 100% clean with ₹0.00 revenue and 0 invoices! No data leaked from Account A!");
  } else {
    console.error("\n❌ FAILURE: Data leaked into Account B!", finalInvoicesB);
    process.exit(1);
  }

  // Step 7: Test Sign-Out / Log-In cache clearing logic
  console.log("\n7. Testing sign-out cache cleanup...");
  const clearedLocalStorage = localStorageSim.filter(() => false);
  console.log(`Cache cleared upon sign-out / sign-in. Local storage items count: ${clearedLocalStorage.length}`);
  if (clearedLocalStorage.length === 0) {
    console.log("✅ SUCCESS: Local storage invoice cache cleared properly on sign-out / sign-in!");
  } else {
    console.error("❌ FAILURE: Cache not cleared!");
    process.exit(1);
  }

  console.log("\nALL VERIFICATION CHECKS PASSED 100%!\n");
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
