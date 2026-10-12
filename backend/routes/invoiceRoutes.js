import express from "express";
import mongoose from "mongoose";
import { checkPlanLimit } from "../utils/authMiddleware.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";
import Invoice from "../models/Invoice.js";
import { calculateAndValidateInvoice } from "../utils/invoiceCalculator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

const verifyTokenOptional = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user && req.user.id !== "000000000000000000000000") return next();
  const token = req.headers.authorization?.split(" ")[1];
  const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";

  if (!token || token === "null" || token === "undefined") {
    req.user = { id: "000000000000000000000000" };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    req.user = { id: "000000000000000000000000" };
    next();
  }
};

const getInvoiceIdFilter = (idParam) => {
  if (mongoose.Types.ObjectId.isValid(idParam)) {
    return { _id: idParam };
  }
  return { invoiceNumber: idParam };
};

const getUserFilter = (req) => {
  if (!req || !req.user) return { userId: null, createdBy: null };
  const userIdStr = req.user._id ? req.user._id.toString() : req.user.id;
  if (!userIdStr || userIdStr === "000000000000000000000000") return { userId: null, createdBy: null };
  const userIdObj = mongoose.Types.ObjectId.isValid(userIdStr) ? new mongoose.Types.ObjectId(userIdStr) : null;
  const userIds = userIdObj ? [userIdObj, userIdStr] : [userIdStr];
  return {
    $or: [
      { userId: { $in: userIds } },
      { createdBy: { $in: userIds } }
    ]
  };
};

// ✅ 0. Public Invoice View (no auth required — for WhatsApp/email sharing links)
router.get("/public/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      ...getInvoiceIdFilter(req.params.id),
      isDeleted: false
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching public invoice:", error);
    res.status(500).json({ message: "Error fetching invoice", error: error.message });
  }
});

// ✅ 1. Create New Invoice
router.post("/create", verifyToken, async (req, res) => {
  try {
    const invoiceData = req.body;

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const limitCheck = await checkPlanLimit(req.user.id, req.user.role, "invoice");
    if (!limitCheck.allowed) {
      return res.status(403).json(limitCheck);
    }
    invoiceData.userId = req.user.id;
    if (!invoiceData.createdBy) {
      invoiceData.createdBy = req.user.id;
    }

    // Authoritative Server-Side Calculation & Validation (DEF-INV-03 & DEF-INV-05)
    const calcResult = calculateAndValidateInvoice(invoiceData);
    if (!calcResult.valid) {
      return res.status(calcResult.statusCode || 400).json({
        message: calcResult.error,
        error: "Invoice calculation validation failed"
      });
    }

    // Merge authoritative server calculations
    Object.assign(invoiceData, calcResult.data);

    // Generate invoice number if not provided
    if (!invoiceData.invoiceNumber) {
      const count = await Invoice.countDocuments({ userId: req.user.id, isDeleted: false });
      invoiceData.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(5, '0')}`;
    }

    const newInvoice = new Invoice(invoiceData);
    await newInvoice.save();

    // Automatically generate Bookkeeping Entry for sales invoice
    const invUserId = newInvoice.userId || req.user.id;
    if (invUserId && invUserId !== "000000000000000000000000") {
      await upsertAutomatedBookkeepingEntry({
        userId: invUserId,
        date: newInvoice.invoiceDate || new Date(),
        description: `Sales Invoice ${newInvoice.invoiceNumber} to ${newInvoice.customerName}`,
        category: "Sales",
        amount: newInvoice.grandTotal,
        type: "income",
        referenceId: `invoice_${newInvoice._id}`
      });
    }

    // Link customer or auto-create Customer document if needed
    const CustomerModel = mongoose.models.Customer || mongoose.model("Customer");
    if (CustomerModel && invUserId) {
      try {
        let customerDoc = null;
        if (newInvoice.customerId) {
          customerDoc = await CustomerModel.findById(newInvoice.customerId);
        }
        if (!customerDoc && newInvoice.customerName) {
          customerDoc = await CustomerModel.findOne({
            $or: [{ userId: invUserId }, { userId: new mongoose.Types.ObjectId(invUserId) }],
            name: { $regex: new RegExp(`^${newInvoice.customerName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
          });
        }
        if (!customerDoc && newInvoice.customerName) {
          customerDoc = new CustomerModel({
            userId: invUserId,
            name: newInvoice.customerName.trim(),
            email: newInvoice.customerEmail || "",
            phone: newInvoice.customerPhone || "",
            billingAddress: newInvoice.customerAddress || "",
            gstin: newInvoice.customerGSTIN || ""
          });
          await customerDoc.save();
        }
        if (customerDoc && !newInvoice.customerId) {
          newInvoice.customerId = customerDoc._id;
          await newInvoice.save();
        }
        if (customerDoc) {
          customerDoc.outstandingBalance = (customerDoc.outstandingBalance || 0) + (newInvoice.balanceDue || 0);
          customerDoc.updatedAt = new Date();
          await customerDoc.save();
        }
      } catch (custErr) {
        console.warn("⚠️ Customer sync warning during invoice creation:", custErr.message);
      }
    }

    res.status(201).json({
      message: "Invoice created successfully!",
      invoice: newInvoice,
      invoiceId: newInvoice._id
    });
  } catch (error) {
    console.error("❌ Error creating invoice:", error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: "Validation Error",
        errors: messages
      });
    }

    // Handle duplicate invoice number
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Invoice number already exists",
        error: "Duplicate invoice number"
      });
    }

    res.status(500).json({
      message: "Error creating invoice",
      error: error.message
    });
  }
});

// ✅ 2. Get All Invoices
router.get("/all", verifyToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerName,
      startDate,
      endDate,
      sortBy = 'invoiceDate',
      sortOrder = 'desc'
    } = req.query;

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const userFilter = getUserFilter(req);
    const query = {
      isDeleted: false,
      ...userFilter
    };

    // Apply filters
    if (status) query.status = status;
    if (customerName) {
      query.customerName = { $regex: customerName, $options: 'i' };
    }
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    // Calculate skip for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries in parallel with lean() for maximum throughput
    const [invoices, total, summary] = await Promise.all([
      Invoice.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-isDeleted')
        .lean(),
      Invoice.countDocuments(query),
      Invoice.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalInvoices: { $sum: 1 },
            totalAmount: { $sum: "$grandTotal" },
            totalPaid: { $sum: "$amountPaid" },
            totalDue: { $sum: "$balanceDue" }
          }
        }
      ])
    ]);

    res.json({
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      summary: summary[0] || {
        totalInvoices: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalDue: 0
      }
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      message: "Error fetching invoices",
      error: error.message
    });
  }
});

// ✅ Receivables & Payables Breakdown API
router.get("/receivables-payables", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const userIdStr = req.user.id || req.user._id?.toString();
    const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr) ? new mongoose.Types.ObjectId(userIdStr) : null;

    const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice");

    // Fetch unpaid sales invoices (Receivables) and purchase invoices (Payables) in parallel with .lean()
    const [salesInvoices, purchaseInvoices] = await Promise.all([
      Invoice.find({
        ...userFilter,
        isDeleted: false,
        sourceInvoiceType: { $ne: "purchase" },
        paymentStatus: { $ne: "paid" }
      }).select("invoiceNumber customerName grandTotal amountPaid balanceDue invoiceDate dueDate paymentStatus status").lean(),
      PurchaseInvoice ? PurchaseInvoice.find({
        $or: [{ userId: userObjectId }, { userId: userIdStr }],
        isDeleted: { $ne: true }
      }).select("billNo supplierName total paid balance createdAt").lean() : Promise.resolve([])
    ]);

    const now = new Date();

    // Group Receivables by Customer
    const customerBreakdownMap = new Map();
    let totalReceivables = 0;
    let overdueReceivables = 0;
    let overdueCount = 0;

    salesInvoices.forEach(inv => {
      const balance = inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0));
      if (balance <= 0) return;

      totalReceivables += balance;
      const isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
      if (isOverdue) {
        overdueReceivables += balance;
        overdueCount++;
      }

      const custName = inv.customerName || "Unassigned Customer";
      const existing = customerBreakdownMap.get(custName) || { customerName: custName, totalOutstanding: 0, invoiceCount: 0, overdueAmount: 0 };
      existing.totalOutstanding += balance;
      existing.invoiceCount += 1;
      if (isOverdue) existing.overdueAmount += balance;
      customerBreakdownMap.set(custName, existing);
    });

    // Group Payables by Supplier
    const supplierBreakdownMap = new Map();
    let totalPayables = 0;

    purchaseInvoices.forEach(inv => {
      const balance = inv.balance !== undefined ? inv.balance : Math.max(0, (inv.total || 0) - (inv.paid || 0));
      if (balance <= 0) return;

      totalPayables += balance;
      const suppName = inv.supplierName || "General Supplier";
      const existing = supplierBreakdownMap.get(suppName) || { supplierName: suppName, totalOutstanding: 0, billCount: 0 };
      existing.totalOutstanding += balance;
      existing.billCount += 1;
      supplierBreakdownMap.set(suppName, existing);
    });

    res.json({
      receivables: {
        totalReceivables,
        overdueReceivables,
        outstandingInvoiceCount: salesInvoices.length,
        overdueInvoiceCount: overdueCount,
        customerBreakdown: Array.from(customerBreakdownMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      },
      payables: {
        totalPayables,
        outstandingBillCount: purchaseInvoices.filter(p => (p.balance || 0) > 0).length,
        supplierBreakdown: Array.from(supplierBreakdownMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      }
    });
  } catch (error) {
    console.error("Error fetching receivables-payables breakdown:", error);
    res.status(500).json({ message: "Error fetching receivables and payables breakdown", error: error.message });
  }
});

// ✅ Search Invoices - keep before "/:id" so Express does not treat "search" as an invoice id
router.get("/search", verifyToken, async (req, res) => {
  try {
    const {
      query,
      field = 'all',
      page = 1,
      limit = 20
    } = req.query;

    if (!query) {
      return res.status(400).json({
        message: "Search query is required"
      });
    }

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const userFilter = getUserFilter(req);
    const searchQuery = {
      isDeleted: false,
      ...userFilter
    };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (field === 'all') {
      searchQuery.$or = [
        { invoiceNumber: { $regex: query, $options: 'i' } },
        { customerName: { $regex: query, $options: 'i' } },
        { customerEmail: { $regex: query, $options: 'i' } },
        { customerPhone: { $regex: query, $options: 'i' } },
        { customerGSTIN: { $regex: query, $options: 'i' } },
        { businessName: { $regex: query, $options: 'i' } },
        { businessGSTIN: { $regex: query, $options: 'i' } },
        { 'items.productName': { $regex: query, $options: 'i' } }
      ];
    } else if (field === 'customer') {
      searchQuery.$or = [
        { customerName: { $regex: query, $options: 'i' } },
        { customerEmail: { $regex: query, $options: 'i' } },
        { customerPhone: { $regex: query, $options: 'i' } },
        { customerGSTIN: { $regex: query, $options: 'i' } }
      ];
    } else if (field === 'invoice') {
      searchQuery.invoiceNumber = { $regex: query, $options: 'i' };
    } else if (field === 'product') {
      searchQuery['items.productName'] = { $regex: query, $options: 'i' };
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(searchQuery)
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Invoice.countDocuments(searchQuery)
    ]);

    res.json({
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error searching invoices:", error);
    res.status(500).json({
      message: "Error searching invoices",
      error: error.message
    });
  }
});

// ✅ 3. Get Single Invoice by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);

    const invoice = await Invoice.findOne({
      ...getInvoiceIdFilter(req.params.id),
      isDeleted: false,
      ...userFilter
    }).lean();

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      message: "Error fetching invoice",
      error: error.message
    });
  }
});

// ✅ 4. Get Invoice by Invoice Number
router.get("/number/:invoiceNumber", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);

    const invoice = await Invoice.findOne({
      invoiceNumber: req.params.invoiceNumber,
      isDeleted: false,
      ...userFilter
    });

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      message: "Error fetching invoice",
      error: error.message
    });
  }
});

// ✅ 5. Update Invoice
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updateData = req.body;
    const userFilter = getUserFilter(req);

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const currentInvoice = await Invoice.findOne({ ...getInvoiceIdFilter(req.params.id), isDeleted: false, ...userFilter }).lean();
    if (!currentInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    // Authoritative Server-Side Calculation & Validation on update if items or financial totals are present (DEF-INV-03 & DEF-INV-05)
    if (updateData.items || updateData.grandTotal !== undefined || updateData.subtotal !== undefined) {
      const mergedData = {
        ...(currentInvoice.toObject ? currentInvoice.toObject() : currentInvoice),
        ...updateData
      };
      const calcResult = calculateAndValidateInvoice(mergedData);
      if (!calcResult.valid) {
        return res.status(calcResult.statusCode || 400).json({
          message: calcResult.error,
          error: "Invoice calculation validation failed"
        });
      }
      Object.assign(updateData, calcResult.data);
    } else if (updateData.amountPaid !== undefined) {
      updateData.balanceDue = Math.max(0, currentInvoice.grandTotal - updateData.amountPaid);
      if (updateData.balanceDue === 0) {
        updateData.paymentStatus = 'paid';
        updateData.status = 'paid';
      } else if (updateData.amountPaid > 0) {
        updateData.paymentStatus = 'partial';
      }
    }

    // Strip protected identity fields
    delete updateData.userId;
    delete updateData.createdBy;
    updateData.updatedAt = new Date();

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { ...getInvoiceIdFilter(req.params.id), isDeleted: false, ...userFilter },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    // Sync automated Bookkeeping Entry
    const invUserId = updatedInvoice.userId || req.user.id;
    if (invUserId && invUserId !== "000000000000000000000000") {
      if (updatedInvoice.status === 'cancelled' || updatedInvoice.isDeleted) {
        await removeAutomatedBookkeepingEntry({
          userId: invUserId,
          referenceId: `invoice_${updatedInvoice._id}`
        });
      } else {
        await upsertAutomatedBookkeepingEntry({
          userId: invUserId,
          date: updatedInvoice.invoiceDate || new Date(),
          description: `Sales Invoice ${updatedInvoice.invoiceNumber} to ${updatedInvoice.customerName}`,
          category: "Sales",
          amount: updatedInvoice.grandTotal,
          type: "income",
          referenceId: `invoice_${updatedInvoice._id}`
        });
      }
    }

    res.json({
      message: "Invoice updated successfully!",
      invoice: updatedInvoice
    });
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({
      message: "Error updating invoice",
      error: error.message
    });
  }
});

// ✅ 6. Delete Invoice (Soft Delete)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);

    const deletedInvoice = await Invoice.findOneAndUpdate(
      { ...getInvoiceIdFilter(req.params.id), ...userFilter },
      {
        isDeleted: true,
        status: 'cancelled',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!deletedInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    // Remove automated Bookkeeping Entry
    const invUserId = deletedInvoice.userId || req.user?.id;
    if (invUserId) {
      await removeAutomatedBookkeepingEntry({
        userId: invUserId,
        referenceId: `invoice_${deletedInvoice._id}`
      });
    }

    res.json({
      message: "Invoice deleted successfully!"
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({
      message: "Error deleting invoice",
      error: error.message
    });
  }
});

// ✅ 7. Update Invoice Status
router.patch("/:id/status", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const userFilter = getUserFilter(req);

    const validStatuses = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status"
      });
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { ...getInvoiceIdFilter(req.params.id), isDeleted: false, ...userFilter },
      {
        status,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    res.json({
      message: "Invoice status updated successfully!",
      invoice: updatedInvoice
    });
  } catch (error) {
    console.error("Error updating invoice status:", error);
    res.status(500).json({
      message: "Error updating invoice status",
      error: error.message
    });
  }
});

// ✅ 8. Update Payment Status
router.all("/:id/payment", verifyToken, async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const { amount, amountPaid, paymentMethod, paymentDate, paymentStatus } = req.body;
    const payAmt = parseFloat(amount || amountPaid || 0);

    const userFilter = getUserFilter(req);

    const invoice = await Invoice.findOne({ ...getInvoiceIdFilter(req.params.id), isDeleted: false, ...userFilter });
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const newAmountPaid = (invoice.amountPaid || 0) + payAmt;
    const newBalanceDue = Math.max(0, invoice.grandTotal - newAmountPaid);
    const newPaymentStatus = newBalanceDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'pending';

    invoice.amountPaid = newAmountPaid;
    invoice.balanceDue = newBalanceDue;
    invoice.paymentStatus = paymentStatus || newPaymentStatus;
    if (newBalanceDue <= 0) {
      invoice.status = 'paid';
    }
    if (paymentMethod) invoice.paymentMethod = paymentMethod;
    if (paymentDate) invoice.paymentDate = new Date(paymentDate);
    invoice.updatedAt = new Date();

    await invoice.save();

    // Recalculate customer's outstanding balance
    const CustomerModel = mongoose.models.Customer || mongoose.model("Customer");
    if (CustomerModel && invoice.customerName) {
      try {
        const custFilter = invoice.customerId ? { _id: invoice.customerId } : { ...userFilter, name: { $regex: new RegExp(`^${invoice.customerName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } };
        const customerDoc = await CustomerModel.findOne(custFilter);
        if (customerDoc) {
          const userInvoices = await Invoice.find({ ...userFilter, isDeleted: false, $or: [{ customerId: customerDoc._id }, { customerName: customerDoc.name }] }).select("balanceDue grandTotal amountPaid").lean();
          const totalRemaining = userInvoices.reduce((sum, inv) => sum + (inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0))), 0);
          customerDoc.outstandingBalance = totalRemaining;
          customerDoc.updatedAt = new Date();
          await customerDoc.save();
        }
      } catch (cErr) {
        console.warn("⚠️ Customer balance update warning on payment:", cErr.message);
      }
    }

    res.json({
      message: "Payment status updated successfully!",
      invoice
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({
      message: "Error updating payment status",
      error: error.message
    });
  }
});

// ✅ 10. Get Invoice Statistics
router.get("/stats/overview", verifyToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const userFilter = getUserFilter(req);
    const matchQuery = {
      isDeleted: false,
      ...userFilter
    };

    // Add date filter if provided
    if (startDate || endDate) {
      matchQuery.invoiceDate = {};
      if (startDate) matchQuery.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchQuery.invoiceDate.$lte = new Date(endDate);
    }

    // Get current month's start and end dates
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get previous month's start and end dates
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Aggregate statistics
    const stats = await Invoice.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          // Overall statistics
          overall: [
            {
              $group: {
                _id: null,
                totalInvoices: { $sum: 1 },
                totalAmount: { $sum: "$grandTotal" },
                totalPaid: { $sum: "$amountPaid" },
                totalDue: { $sum: "$balanceDue" },
                avgInvoiceAmount: { $avg: "$grandTotal" }
              }
            }
          ],

          // Status distribution
          statusDistribution: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: { $sum: "$grandTotal" }
              }
            }
          ],

          // Payment status distribution
          paymentDistribution: [
            {
              $group: {
                _id: "$paymentStatus",
                count: { $sum: 1 },
                totalAmount: { $sum: "$grandTotal" }
              }
            }
          ],

          // Current month statistics
          currentMonth: [
            {
              $match: {
                invoiceDate: {
                  $gte: currentMonthStart,
                  $lte: currentMonthEnd
                }
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalAmount: { $sum: "$grandTotal" }
              }
            }
          ],

          // Previous month statistics
          previousMonth: [
            {
              $match: {
                invoiceDate: {
                  $gte: prevMonthStart,
                  $lte: prevMonthEnd
                }
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalAmount: { $sum: "$grandTotal" }
              }
            }
          ],

          // Top customers
          topCustomers: [
            {
              $group: {
                _id: "$customerName",
                invoiceCount: { $sum: 1 },
                totalSpent: { $sum: "$grandTotal" }
              }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    // Format response
    const result = {
      overall: stats[0]?.overall[0] || {},
      statusDistribution: stats[0]?.statusDistribution || [],
      paymentDistribution: stats[0]?.paymentDistribution || [],
      currentMonth: stats[0]?.currentMonth[0] || { count: 0, totalAmount: 0 },
      previousMonth: stats[0]?.previousMonth[0] || { count: 0, totalAmount: 0 },
      topCustomers: stats[0]?.topCustomers || []
    };

    // Calculate month-over-month growth
    const currentMonthTotal = result.currentMonth.totalAmount || 0;
    const previousMonthTotal = result.previousMonth.totalAmount || 0;
    const growthRate = previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal * 100).toFixed(2)
      : 0;

    result.monthlyGrowth = {
      currentMonthTotal,
      previousMonthTotal,
      growthRate: parseFloat(growthRate),
      isPositive: currentMonthTotal > previousMonthTotal
    };

    res.json(result);
  } catch (error) {
    console.error("Error fetching invoice statistics:", error);
    res.status(500).json({
      message: "Error fetching invoice statistics",
      error: error.message
    });
  }
});

// ✅ 11. Generate Invoice Report
router.get("/reports/generate", verifyToken, async (req, res) => {
  try {
    const {
      format = 'json',
      startDate,
      endDate,
      status,
      paymentStatus
    } = req.query;

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const userFilter = getUserFilter(req);
    const query = {
      isDeleted: false,
      ...userFilter
    };

    // Apply filters
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const invoices = await Invoice.find(query)
      .sort({ invoiceDate: -1 })
      .select('-isDeleted -__v');

    // Generate report based on format
    if (format === 'csv') {
      // Convert to CSV
      let csvContent = "Invoice Number,Date,Customer,Total Amount,Amount Paid,Balance Due,Status,Payment Status\n";

      invoices.forEach(invoice => {
        csvContent += `"${invoice.invoiceNumber}","${invoice.invoiceDate.toISOString().split('T')[0]}","${invoice.customerName}",${invoice.grandTotal},${invoice.amountPaid},${invoice.balanceDue},"${invoice.status}","${invoice.paymentStatus}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=invoice_report_${Date.now()}.csv`);
      return res.send(csvContent);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=invoice_report_${Date.now()}.json`);
      return res.json(invoices);
    } else {
      // Default JSON response
      res.json({
        reportGenerated: new Date(),
        totalRecords: invoices.length,
        filters: {
          startDate,
          endDate,
          status,
          paymentStatus
        },
        data: invoices
      });
    }
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({
      message: "Error generating report",
      error: error.message
    });
  }
});

// ✅ 12. Get Overdue Invoices
router.get("/overdue", verifyToken, async (req, res) => {
  try {
    const today = new Date();

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const userFilter = getUserFilter(req);
    const overdueInvoices = await Invoice.find({
      isDeleted: false,
      paymentStatus: { $ne: 'paid' },
      dueDate: { $lt: today },
      balanceDue: { $gt: 0 },
      ...userFilter
    })
      .sort({ dueDate: 1 })
      .limit(50);

    // Calculate total overdue amount
    const totalOverdue = overdueInvoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);

    res.json({
      totalOverdueInvoices: overdueInvoices.length,
      totalOverdueAmount: totalOverdue,
      overdueInvoices
    });
  } catch (error) {
    console.error("Error fetching overdue invoices:", error);
    res.status(500).json({
      message: "Error fetching overdue invoices",
      error: error.message
    });
  }
});

// ✅ 13. Bulk Update Invoices (DEF-INV-01)
router.post("/bulk/update", verifyToken, async (req, res) => {
  try {
    const { invoiceIds, updateData } = req.body;

    if (!req.user || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        message: "Invoice IDs array is required"
      });
    }

    const userFilter = getUserFilter(req);
    if (!userFilter || userFilter.userId === null) {
      return res.status(401).json({ message: "Access denied. Valid user token required." });
    }

    const sanitizedUpdate = { ...updateData };
    delete sanitizedUpdate.userId;
    delete sanitizedUpdate.createdBy;
    sanitizedUpdate.updatedAt = new Date();

    const result = await Invoice.updateMany(
      { _id: { $in: invoiceIds }, isDeleted: false, ...userFilter },
      sanitizedUpdate
    );

    res.json({
      message: `${result.modifiedCount} invoices updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error bulk updating invoices:", error);
    res.status(500).json({
      message: "Error bulk updating invoices",
      error: error.message
    });
  }
});

export default router;
