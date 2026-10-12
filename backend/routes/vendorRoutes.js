import express from "express";
import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Helper to get user filter for tenant isolation
const getUserFilter = (req) => {
  const userIdStr = req.user?.id || req.user?._id?.toString();
  if (!userIdStr) return { userId: null };
  const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr)
    ? new mongoose.Types.ObjectId(userIdStr)
    : null;

  return userObjectId
    ? { $or: [{ userId: userObjectId }, { userId: userIdStr }] }
    : { userId: userIdStr };
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user) return next();
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// 1. Create Vendor
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, companyName, email, phone, address, gstin, placeOfSupply, paymentTerms, notes, status } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Vendor name is required" });
    }

    const userFilter = getUserFilter(req);
    const userId = req.user.id || req.user._id;

    // Check for duplicate vendor name under same user
    const existing = await Vendor.findOne({
      ...userFilter,
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({ message: `Vendor with name '${name.trim()}' already exists.` });
    }

    const newVendor = new Vendor({
      userId,
      name: name.trim(),
      companyName: companyName ? companyName.trim() : "",
      email: email ? email.trim() : "",
      phone: phone ? phone.trim() : "",
      address: address ? address.trim() : "",
      gstin: gstin ? gstin.trim().toUpperCase() : "",
      placeOfSupply: placeOfSupply ? placeOfSupply.trim() : "",
      paymentTerms: paymentTerms || "Net 30",
      notes: notes ? notes.trim() : "",
      status: status && ["active", "inactive"].includes(status) ? status : "active"
    });

    await newVendor.save();
    res.status(201).json({
      message: "Vendor created successfully!",
      vendor: newVendor
    });
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({ message: "Failed to create vendor", error: error.message });
  }
});

// 2. Get All Vendors (with search, filter, pagination)
router.get("/", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { q, status, page, limit } = req.query;

    const queryFilter = { ...userFilter };

    if (status && status !== "all") {
      queryFilter.status = status;
    }

    if (q) {
      const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      queryFilter.$and = queryFilter.$and || [];
      queryFilter.$and.push({
        $or: [
          { name: searchRegex },
          { companyName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { gstin: searchRegex }
        ]
      });
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const skip = (pageNum - 1) * limitNum;

      const [vendors, total] = await Promise.all([
        Vendor.find(queryFilter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
        Vendor.countDocuments(queryFilter)
      ]);

      return res.json({
        vendors,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      });
    }

    // Default: return array of all vendors
    const vendors = await Vendor.find(queryFilter).sort({ name: 1 }).lean();
    res.json(vendors);
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.status(500).json({ message: "Failed to fetch vendors", error: error.message });
  }
});

// 3. Get Vendor Detail (with Aggregated Financial Metrics)
router.get("/:id/detail", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const vendor = await Vendor.findOne({ _id: req.params.id, ...userFilter }).lean();

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice");
    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");

    // Fetch purchase bills matching vendor name or ID
    const purchaseBills = PurchaseInvoice ? await PurchaseInvoice.find({
      ...userFilter,
      isDeleted: { $ne: true },
      supplierName: { $regex: new RegExp(`^${vendor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).sort({ createdAt: -1 }).lean() : [];

    // Fetch bookkeeping entries categorized under Purchases/Expense matching vendor name
    const expenseEntries = BookkeepingEntry ? await BookkeepingEntry.find({
      ...userFilter,
      type: "Expenses",
      description: { $regex: new RegExp(vendor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    }).sort({ date: -1 }).limit(20).lean() : [];

    let totalPurchases = 0;
    let totalPaid = 0;
    let outstandingPayable = 0;
    let overduePayable = 0;

    const recentBills = [];
    const outstandingPayables = [];
    const paymentHistory = [];

    purchaseBills.forEach(bill => {
      const grandTotal = bill.total || bill.subtotal || 0;
      const paid = bill.paid || 0;
      const balance = bill.balance !== undefined ? bill.balance : Math.max(0, grandTotal - paid);

      totalPurchases += grandTotal;
      totalPaid += paid;
      outstandingPayable += balance;

      const billItem = {
        _id: bill._id,
        billNo: bill.billNo,
        billDate: bill.billDate || bill.createdAt,
        total: grandTotal,
        paid,
        balance,
        paymentMethod: bill.paymentMethod || "Cash"
      };

      if (recentBills.length < 10) {
        recentBills.push(billItem);
      }

      if (balance > 0) {
        outstandingPayables.push(billItem);
      }

      if (paid > 0) {
        paymentHistory.push({
          billId: bill._id,
          billNo: bill.billNo,
          date: bill.createdAt,
          amountPaid: paid,
          paymentMethod: bill.paymentMethod || "Cash"
        });
      }
    });

    res.json({
      vendor,
      financialSummary: {
        totalPurchases,
        totalPaid,
        outstandingPayable,
        overduePayable,
        billCount: purchaseBills.length,
        outstandingCount: outstandingPayables.length,
        bookkeepingExpenseCount: expenseEntries.length
      },
      recentBills,
      outstandingPayables,
      paymentHistory,
      expenseEntries
    });
  } catch (error) {
    console.error("Error fetching vendor details:", error);
    res.status(500).json({ message: "Failed to fetch vendor detail profile", error: error.message });
  }
});

// 4. Get Single Vendor
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const vendor = await Vendor.findOne({ _id: req.params.id, ...userFilter }).lean();
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.json(vendor);
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({ message: "Failed to fetch vendor", error: error.message });
  }
});

// 5. Update Vendor
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const updateData = { ...req.body };
    delete updateData.userId;
    delete updateData._id;
    updateData.updatedAt = new Date();

    const updatedVendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, ...userFilter },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.json({
      message: "Vendor updated successfully!",
      vendor: updatedVendor
    });
  } catch (error) {
    console.error("Error updating vendor:", error);
    res.status(500).json({ message: "Failed to update vendor", error: error.message });
  }
});

// 6. Delete or Soft-Deactivate Vendor
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const vendor = await Vendor.findOne({ _id: req.params.id, ...userFilter });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice");
    const hasBills = PurchaseInvoice ? await PurchaseInvoice.exists({
      ...userFilter,
      isDeleted: { $ne: true },
      supplierName: { $regex: new RegExp(`^${vendor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }) : false;

    if (hasBills) {
      // Soft-deactivate if financial history exists
      vendor.status = "inactive";
      vendor.updatedAt = new Date();
      await vendor.save();
      return res.json({
        message: "Vendor deactivated successfully (financial history preserved).",
        vendor,
        deactivated: true
      });
    }

    // Hard delete if no financial history exists
    await Vendor.deleteOne({ _id: req.params.id, ...userFilter });

    res.json({
      message: "Vendor deleted successfully!",
      deleted: true
    });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    res.status(500).json({ message: "Failed to delete vendor", error: error.message });
  }
});

export default router;
