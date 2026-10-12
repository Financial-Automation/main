import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import csvParser from "csv-parser";
import xlsx from "xlsx";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import BankTransaction from "../models/BankTransaction.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";

const router = express.Router();

// Helper to get user filter for tenant isolation
const getUserFilter = (req) => {
  const userIdStr = req.user?.id || req.user?._id?.toString();
  if (!userIdStr || userIdStr === "000000000000000000000000") return { userId: null };
  const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr)
    ? new mongoose.Types.ObjectId(userIdStr)
    : null;

  return userObjectId
    ? { $or: [{ userId: userObjectId }, { userId: userIdStr }] }
    : { userId: userIdStr };
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user && req.user.id) return next();
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      ...decoded,
      id: decoded.id || decoded._id?.toString(),
    };
    if (!req.user.id || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Invalid authorization token." });
    }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid authorization token." });
  }
};

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (["csv", "xlsx", "xls"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file format. Only CSV, XLSX, and XLS files are allowed."));
    }
  },
});

// Helper function to process uploaded file safely
const processUploadedFile = async (filePath, fileType) => {
  try {
    let data = [];

    if (fileType === "csv") {
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on("data", (row) => data.push(row))
          .on("end", () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            resolve(data);
          })
          .on("error", (err) => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            reject(err);
          });
      });
    } else if (fileType === "xlsx" || fileType === "xls") {
      const workbook = xlsx.read(fs.readFileSync(filePath));
      const sheetName = workbook.SheetNames[0];
      data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return data;
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error("Unsupported file type. Only CSV and Excel files are supported.");
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  }
};

// Similarity calculation using Levenshtein distance
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const s1 = String(str1).toLowerCase().trim();
  const s2 = String(str2).toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matrix = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
};

// Enhanced Multi-Signal Matching Algorithm
const calculateMatchScore = (ledgerTx, bankTx, customers = [], vendors = []) => {
  let score = 0;
  const reasons = [];

  const ledgerDate = new Date(ledgerTx.date || ledgerTx.invoiceDate || Date.now());
  const bankDate = new Date(bankTx.date || Date.now());
  const dateDiffDays = Math.abs(ledgerDate - bankDate) / (1000 * 60 * 60 * 24);

  // 1. Amount Match (40 pts)
  const ledgerAmount = Math.abs(parseFloat(ledgerTx.amount || ledgerTx.grandTotal || 0));
  const bankAmount = Math.abs(parseFloat(bankTx.amount || 0));
  const amountDiff = Math.abs(ledgerAmount - bankAmount);

  if (amountDiff <= 0.01) {
    score += 40;
    reasons.push("Exact amount match");
  } else if (ledgerAmount > 0 && amountDiff / ledgerAmount <= 0.01) {
    score += 25;
    reasons.push("Amount within 1%");
  }

  // 2. Date Proximity (30 pts)
  if (dateDiffDays === 0) {
    score += 30;
    reasons.push("Exact date match");
  } else if (dateDiffDays <= 3) {
    const pts = Math.round(30 * (1 - dateDiffDays / 3));
    score += pts;
    reasons.push(`Date within ${Math.ceil(dateDiffDays)} day(s)`);
  }

  // 3. Reference / Invoice Number Match (15 pts)
  const ledgerRef = (ledgerTx.referenceId || ledgerTx.invoiceNumber || "").toString().toLowerCase().trim();
  const bankRef = (bankTx.referenceNumber || "").toString().toLowerCase().trim();
  const bankDesc = (bankTx.description || "").toLowerCase();

  if (ledgerRef && bankRef && ledgerRef === bankRef) {
    score += 15;
    reasons.push(`Reference ID #${ledgerRef} matched`);
  } else if (ledgerRef && bankDesc.includes(ledgerRef)) {
    score += 15;
    reasons.push(`Bank narration contains invoice #${ledgerRef}`);
  }

  // 4. Description / Customer / Vendor Match (15 pts)
  const ledgerDesc = ledgerTx.description || ledgerTx.customerName || ledgerTx.vendorName || "";
  const descSim = calculateSimilarity(ledgerDesc, bankTx.description);
  if (descSim >= 0.7) {
    score += Math.round(15 * descSim);
    reasons.push("Description keyword match");
  }

  // Check customer or vendor names inside description
  let matchedEntityName = "";
  if (bankTx.type === "credit") {
    const foundCust = customers.find((c) => c.name && bankDesc.includes(c.name.toLowerCase()));
    if (foundCust) {
      score += 10;
      matchedEntityName = foundCust.name;
      reasons.push(`Matched customer name '${foundCust.name}'`);
    }
  } else {
    const foundVend = vendors.find((v) => v.name && bankDesc.includes(v.name.toLowerCase()));
    if (foundVend) {
      score += 10;
      matchedEntityName = foundVend.name;
      reasons.push(`Matched vendor name '${foundVend.name}'`);
    }
  }

  const finalScore = Math.min(100, Math.round(score));
  return {
    score: finalScore,
    reasons,
    matchedEntityName,
  };
};

const getMatchType = (score) => {
  if (score >= 95) return "exact";
  if (score >= 80) return "strong";
  if (score >= 60) return "possible";
  return "unmatched";
};

// ✅ 1. Reconciliation Control Center Summary API
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);

    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");

    // System Ledger Balance from Bookkeeping
    let systemLedgerBalance = 0;
    if (BookkeepingEntry) {
      const bkEntries = await BookkeepingEntry.find({ ...userFilter, isDeleted: { $ne: true } }).lean();
      bkEntries.forEach((e) => {
        const amt = e.amount || 0;
        if (e.type === "income" || e.type === "Income") systemLedgerBalance += amt;
        if (e.type === "expense" || e.type === "Expense" || e.type === "Expenses") systemLedgerBalance -= amt;
      });
    }

    // Statement Transactions
    const { startDate, endDate } = req.query;
    const txFilter = { ...userFilter };
    if (startDate || endDate) {
      txFilter.date = {};
      if (startDate) txFilter.date.$gte = new Date(startDate);
      if (endDate) txFilter.date.$lte = new Date(endDate);
    }

    const bankTransactions = await BankTransaction.find(txFilter).sort({ date: -1 }).lean();

    let latestBankBalance = systemLedgerBalance;
    let openingBalance = systemLedgerBalance;
    let totalCount = bankTransactions.length;
    let matchedCount = 0;
    let suggestedCount = 0;
    let reconciledCount = 0;
    let unmatchedCount = 0;
    let lastReconciledDate = null;

    let totalInflow = 0;
    let totalOutflow = 0;

    bankTransactions.forEach((tx) => {
      if (tx.type === "credit" || tx.type === "inflow") {
        totalInflow += tx.amount || 0;
      } else {
        totalOutflow += tx.amount || 0;
      }

      if (tx.status === "reconciled") {
        reconciledCount++;
        if (!lastReconciledDate || new Date(tx.reconciledAt) > new Date(lastReconciledDate)) {
          lastReconciledDate = tx.reconciledAt;
        }
      } else if (tx.status === "matched") {
        suggestedCount++;
        matchedCount++;
      } else {
        unmatchedCount++;
      }

      if (tx.runningBalance && tx.runningBalance > 0) {
        latestBankBalance = tx.runningBalance;
      }
    });

    openingBalance = latestBankBalance - totalInflow + totalOutflow;

    const difference = Math.abs(latestBankBalance - systemLedgerBalance);
    const reconciliationPercentage =
      totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 100;

    const warningMessage =
      difference > 0
        ? `Bank statement balance and ledger balance differ by ₹${difference.toLocaleString("en-IN")}.`
        : unmatchedCount > 0
        ? `${unmatchedCount} bank statement transaction(s) remain unreconciled.`
        : `All bank statement transactions fully reconciled.`;

    res.json({
      openingBalance,
      latestBankBalance,
      systemLedgerBalance,
      difference,
      totalTransactions: totalCount,
      matchedCount,
      suggestedCount,
      reconciledCount,
      unmatchedCount,
      reconciliationPercentage,
      lastReconciliationDate: lastReconciledDate || new Date(),
      status: difference === 0 && unmatchedCount === 0 ? "balanced" : "needs_attention",
      warningMessage,
      totalInflow,
      totalOutflow,
    });
  } catch (error) {
    console.error("Error generating reconciliation summary:", error);
    res.status(500).json({ message: "Error generating reconciliation summary", error: error.message });
  }
});

// ✅ 2. Upload Bank Statement & Auto-Match with Ledger & Invoices
router.post("/upload-statement", verifyToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No statement file uploaded" });
    }

    const filePath = req.file.path;
    const fileType = req.file.originalname.split(".").pop().toLowerCase();
    const userFilter = getUserFilter(req);
    const userId = req.user.id || req.user._id;

    const parsedRows = await processUploadedFile(filePath, fileType);
    if (!parsedRows || parsedRows.length === 0) {
      return res.status(400).json({ message: "Uploaded statement file contains no valid rows" });
    }

    const statementId = `STMT_${Date.now()}`;
    const importedItems = [];
    let duplicateCount = 0;

    // Fetch live Bookkeeping entries, Invoices, Customers & Vendors for multi-signal matching
    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
    const InvoiceModel = mongoose.models.Invoice || mongoose.model("Invoice");

    const [bkEntries, invoices, customers, vendors] = await Promise.all([
      BookkeepingEntry ? BookkeepingEntry.find({ ...userFilter, isDeleted: { $ne: true } }).lean() : [],
      InvoiceModel ? InvoiceModel.find({ ...userFilter }).lean() : [],
      Customer.find({ ...userFilter }).lean(),
      Vendor.find({ ...userFilter }).lean(),
    ]);

    for (const row of parsedRows) {
      const rawDate = row.date || row.Date || row.TxnDate || row.TransactionDate || new Date();
      const txnDate = isNaN(new Date(rawDate).getTime()) ? new Date() : new Date(rawDate);
      const desc =
        row.description ||
        row.Description ||
        row.narration ||
        row.Narration ||
        row.Particulars ||
        "Bank Transaction";
      const refNo = row.referenceNumber || row.reference || row.RefNo || row.ChequeNo || row.TxnID || "";

      const credit = parseFloat(row.credit || row.Credit || row.deposit || row.Deposit || 0);
      const debit = parseFloat(row.debit || row.Debit || row.withdrawal || row.Withdrawal || 0);
      const rawAmount = parseFloat(row.amount || row.Amount || 0);

      let amount = rawAmount;
      let type = "credit";

      if (credit > 0) {
        amount = credit;
        type = "credit";
      } else if (debit > 0) {
        amount = debit;
        type = "debit";
      } else if (rawAmount < 0) {
        amount = Math.abs(rawAmount);
        type = "debit";
      }

      if (amount <= 0) continue; // Skip 0 value rows

      // Composite fingerprint key for duplicate import protection
      const normDesc = desc.trim().toLowerCase().replace(/\s+/g, " ");
      const hashRaw = `${userId}_${txnDate.toISOString().split("T")[0]}_${amount}_${type}_${normDesc}_${refNo}`;
      const transactionHash = crypto.createHash("md5").update(hashRaw).digest("hex");

      // Check duplicate import
      const existing = await BankTransaction.findOne({ userId, transactionHash });
      if (existing) {
        duplicateCount++;
        continue;
      }

      // Matching engine
      let bestBkMatch = null;
      let bestInvMatch = null;
      let bestResult = { score: 0, reasons: [], matchedEntityName: "" };

      // 1. Check Bookkeeping Entries
      bkEntries.forEach((bk) => {
        const res = calculateMatchScore(
          bk,
          { date: txnDate, amount, description: desc, referenceNumber: refNo, type },
          customers,
          vendors
        );
        if (res.score > bestResult.score && res.score >= 50) {
          bestResult = res;
          bestBkMatch = bk;
          bestInvMatch = null;
        }
      });

      // 2. Check Invoices
      invoices.forEach((inv) => {
        const res = calculateMatchScore(
          inv,
          { date: txnDate, amount, description: desc, referenceNumber: refNo, type },
          customers,
          vendors
        );
        if (res.score > bestResult.score && res.score >= 50) {
          bestResult = res;
          bestInvMatch = inv;
          bestBkMatch = null;
        }
      });

      const matchTypeStr = getMatchType(bestResult.score);
      const statusStr = matchTypeStr === "exact" || matchTypeStr === "strong" ? "matched" : "unmatched";

      const bankTx = new BankTransaction({
        userId,
        statementId,
        transactionHash,
        date: txnDate,
        description: desc.trim(),
        referenceNumber: refNo.trim(),
        type,
        amount,
        runningBalance: parseFloat(row.balance || row.Balance || 0),
        status: statusStr,
        matchedBookkeepingId: bestBkMatch ? bestBkMatch._id : null,
        matchedInvoiceId: bestInvMatch ? bestInvMatch._id : null,
        matchedCustomerName: type === "credit" ? bestResult.matchedEntityName : "",
        matchedVendorName: type === "debit" ? bestResult.matchedEntityName : "",
        matchScore: bestResult.score,
        matchType: matchTypeStr,
        matchReasons: bestResult.reasons,
      });

      await bankTx.save();
      importedItems.push(bankTx);
    }

    res.status(201).json({
      message: `Bank statement imported successfully. (${importedItems.length} new, ${duplicateCount} duplicates skipped).`,
      statementId,
      importedCount: importedItems.length,
      duplicateCount,
      preview: importedItems.slice(0, 10),
    });
  } catch (error) {
    console.error("Error uploading statement:", error);
    res.status(500).json({ message: "Failed to process bank statement upload", error: error.message });
  }
});

// ✅ 3. Get Bank Transactions for Review & Filter
router.get("/transactions", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { status, type, q, startDate, endDate, page = 1, limit = 100 } = req.query;

    const filter = { ...userFilter };
    if (status && status !== "all") {
      filter.status = status;
    }
    if (type && type !== "all") {
      filter.type = type;
    }
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ description: regex }, { referenceNumber: regex }];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 100;
    const skip = (pageNum - 1) * limitNum;

    const total = await BankTransaction.countDocuments(filter);
    const transactions = await BankTransaction.find(filter)
      .populate("matchedBookkeepingId")
      .populate("matchedInvoiceId")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      transactions,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching bank transactions:", error);
    res.status(500).json({ message: "Failed to fetch bank transactions", error: error.message });
  }
});

// ✅ 4. Search Ledger Entries or Invoices for Manual Linking
router.get("/search-ledger", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { q, type } = req.query;

    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
    const InvoiceModel = mongoose.models.Invoice || mongoose.model("Invoice");

    const queryRegex = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

    let bkFilter = { ...userFilter, isDeleted: { $ne: true } };
    if (type === "credit") bkFilter.type = { $in: ["income", "Income"] };
    if (type === "debit") bkFilter.type = { $in: ["expense", "Expense", "Expenses"] };
    if (queryRegex) bkFilter.$or = [{ description: queryRegex }, { category: queryRegex }];

    const bookkeepingEntries = BookkeepingEntry
      ? await BookkeepingEntry.find(bkFilter).sort({ date: -1 }).limit(20).lean()
      : [];

    let invFilter = { ...userFilter };
    if (queryRegex) invFilter.$or = [{ invoiceNumber: queryRegex }, { customerName: queryRegex }];
    const invoices = InvoiceModel ? await InvoiceModel.find(invFilter).sort({ invoiceDate: -1 }).limit(20).lean() : [];

    res.json({
      bookkeepingEntries,
      invoices,
    });
  } catch (error) {
    console.error("Error searching ledger:", error);
    res.status(500).json({ message: "Failed to search ledger", error: error.message });
  }
});

// ✅ 5. Explicitly Reconcile a Bank Transaction Match
router.post("/reconcile-item", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { bankTransactionId, bookkeepingId, invoiceId, note } = req.body;

    if (!bankTransactionId) {
      return res.status(400).json({ message: "Bank transaction ID is required" });
    }

    const bankTx = await BankTransaction.findOne({ _id: bankTransactionId, ...userFilter });
    if (!bankTx) {
      return res.status(404).json({ message: "Bank transaction not found" });
    }

    if (bookkeepingId) {
      const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
      const bk = await BookkeepingEntry.findOne({ _id: bookkeepingId, ...userFilter });
      if (!bk) {
        return res.status(404).json({ message: "Linked Bookkeeping entry not found" });
      }
      bankTx.matchedBookkeepingId = bk._id;
      bankTx.matchedInvoiceId = null;
    } else if (invoiceId) {
      const InvoiceModel = mongoose.models.Invoice || mongoose.model("Invoice");
      const inv = await InvoiceModel.findOne({ _id: invoiceId, ...userFilter });
      if (!inv) {
        return res.status(404).json({ message: "Linked Invoice not found" });
      }
      bankTx.matchedInvoiceId = inv._id;
      bankTx.matchedBookkeepingId = null;
    }

    bankTx.status = "reconciled";
    bankTx.reconciledAt = new Date();
    bankTx.reconciledBy = req.user.email || req.user.id;
    if (note) bankTx.notes = note;
    await bankTx.save();

    res.json({
      message: "Bank transaction reconciled successfully!",
      bankTransaction: bankTx,
    });
  } catch (error) {
    console.error("Error reconciling transaction:", error);
    res.status(500).json({ message: "Failed to reconcile transaction", error: error.message });
  }
});

// ✅ 6. Unmatch / Reject Suggested Match
router.post("/unmatch-item", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { bankTransactionId } = req.body;

    if (!bankTransactionId) {
      return res.status(400).json({ message: "Bank transaction ID is required" });
    }

    const bankTx = await BankTransaction.findOne({ _id: bankTransactionId, ...userFilter });
    if (!bankTx) {
      return res.status(404).json({ message: "Bank transaction not found" });
    }

    bankTx.status = "unmatched";
    bankTx.matchedBookkeepingId = null;
    bankTx.matchedInvoiceId = null;
    bankTx.matchScore = 0;
    bankTx.matchType = "unmatched";
    bankTx.matchReasons = [];
    await bankTx.save();

    res.json({
      message: "Match rejected. Transaction marked as unmatched.",
      bankTransaction: bankTx,
    });
  } catch (error) {
    console.error("Error unmatching transaction:", error);
    res.status(500).json({ message: "Failed to unmatch transaction", error: error.message });
  }
});

// ✅ 7. Create Bookkeeping Entry ONLY after explicit user action
router.post("/create-bookkeeping-entry", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { bankTransactionId, category, description } = req.body;

    if (!bankTransactionId || !category) {
      return res.status(400).json({ message: "Bank transaction ID and category are required" });
    }

    const bankTx = await BankTransaction.findOne({ _id: bankTransactionId, ...userFilter });
    if (!bankTx) {
      return res.status(404).json({ message: "Bank transaction not found" });
    }

    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
    const entryType = bankTx.type === "credit" || bankTx.type === "inflow" ? "income" : "expense";

    const newBk = new BookkeepingEntry({
      userId: req.user.id,
      date: bankTx.date || new Date(),
      description: description || bankTx.description,
      type: entryType,
      amount: bankTx.amount,
      category: category.trim(),
      referenceId: `bank_reconcile_${bankTx._id}`,
      isAutomated: false,
    });

    await newBk.save();

    // Reconcile the bank transaction to this newly created bookkeeping entry
    bankTx.matchedBookkeepingId = newBk._id;
    bankTx.status = "reconciled";
    bankTx.matchScore = 100;
    bankTx.matchType = "manual";
    bankTx.matchReasons = ["Explicitly created matching bookkeeping entry"];
    bankTx.reconciledAt = new Date();
    bankTx.reconciledBy = req.user.email || req.user.id;
    await bankTx.save();

    res.status(201).json({
      message: "Matching bookkeeping entry created & bank transaction reconciled!",
      bookkeepingEntry: newBk,
      bankTransaction: bankTx,
    });
  } catch (error) {
    console.error("Error creating bookkeeping entry from bank tx:", error);
    res.status(500).json({ message: "Failed to create bookkeeping entry", error: error.message });
  }
});

export default router;