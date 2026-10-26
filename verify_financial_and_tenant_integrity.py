import os
import json
import subprocess

def run_mongo_check():
    cmd = """node -e '
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

await mongoose.connect(process.env.PRO_MONGO_URI);
const db = mongoose.connection.db;

const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }));
const Customer = mongoose.model("Customer", new mongoose.Schema({}, { strict: false }));
const Invoice = mongoose.model("Invoice", new mongoose.Schema({}, { strict: false }));
const Payment = mongoose.model("Payment", new mongoose.Schema({}, { strict: false }));

const testUser = await User.findOne({ email: "jmeter_loadtest@saaiss.in" });
const testUserId = testUser._id.toString();

// Check 1: Tenant Isolation - ensure no test customer belongs to another user
const allCusts = await Customer.find({ companyName: "JMeter Load Test Ltd" });
const invalidTenantCusts = allCusts.filter(c => c.userId.toString() !== testUserId);

// Check 2: Financial Integrity - Duplicate Invoices
const duplicateInvoices = await Invoice.aggregate([
  { $group: { _id: "$invoiceNumber", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
]);

// Check 3: Financial Integrity - Duplicate Payments
const duplicatePayments = await Payment.aggregate([
  { $group: { _id: "$paymentNumber", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
]);

// Check 4: Bookkeeping Balance (Debit == Credit)
const Bookkeeping = mongoose.model("Bookkeeping", new mongoose.Schema({}, { strict: false }));
const entries = await Bookkeeping.find({ userId: testUser._id });
let totalDebit = 0;
let totalCredit = 0;
entries.forEach(e => {
  totalDebit += (e.debit || 0);
  totalCredit += (e.credit || 0);
});

console.log(JSON.stringify({
  testUserId,
  totalTestCustomers: allCusts.length,
  invalidTenantCustomers: invalidTenantCusts.length,
  duplicateInvoicesCount: duplicateInvoices.length,
  duplicatePaymentsCount: duplicatePayments.length,
  bookkeepingEntriesCount: entries.length,
  totalDebit: roundTwo(totalDebit),
  totalCredit: roundTwo(totalCredit),
  ledgerBalanced: Math.abs(totalDebit - totalCredit) < 0.01
}));

function roundTwo(val) {
  return Math.round(val * 100) / 100;
}

await mongoose.disconnect();
'"""
    backend_dir = os.path.abspath("backend")
    out = subprocess.check_output(cmd, shell=True, cwd=backend_dir).decode().strip()
    lines = [l for l in out.split("\n") if l.strip().startswith("{")]
    if lines:
        return json.loads(lines[-1])
    return {"error": "Failed to parse Mongo output"}

if __name__ == "__main__":
    res = run_mongo_check()
    print("==================================================")
    print("🔒 FINANCIAL INTEGRITY & TENANT ISOLATION CHECK")
    print("==================================================")
    print(json.dumps(res, indent=2))
