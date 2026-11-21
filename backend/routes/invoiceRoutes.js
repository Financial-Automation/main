import express from "express";
import mongoose from "mongoose";
import { checkPlanLimit } from "../utils/authMiddleware.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";
import Invoice from "../models/Invoice.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Payment from "../models/Payment.js";
import { calculateAndValidateInvoice, validateAndRecalculateInvoice } from "../utils/invoiceCalculator.js";

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
  if (!idParam) return { _id: null };
  const cleanId = String(idParam).trim();
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    return {
      $or: [
        { _id: new mongoose.Types.ObjectId(cleanId) },
        { invoiceNumber: cleanId }
      ]
    };
  }
  return { invoiceNumber: cleanId };
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

const buildInvoiceQuery = (idParam, req, extraFilter = {}) => {
  const idQuery = getInvoiceIdFilter(idParam);
  const userFilter = getUserFilter(req);
  const conditions = [idQuery];
  if (userFilter && Object.keys(userFilter).length > 0) {
    conditions.push(userFilter);
  }
  if (extraFilter && Object.keys(extraFilter).length > 0) {
    conditions.push(extraFilter);
  }
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

// ✅ 0. Public Invoice View (no auth required — for WhatsApp/email sharing links)
router.get("/public/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    let invoice = null;

    if (idParam && mongoose.Types.ObjectId.isValid(idParam)) {
      invoice = await Invoice.findOne({ _id: idParam, isDeleted: false });
    }

    if (!invoice && idParam) {
      invoice = await Invoice.findOne({
        invoiceNumber: idParam,
        isDeleted: false
      });
    }

    if (!invoice && idParam) {
      // Case-insensitive match on invoiceNumber
      invoice = await Invoice.findOne({
        invoiceNumber: { $regex: new RegExp(`^${idParam}$`, 'i') },
        isDeleted: false
      });
    }

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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📥 Creating invoice for customer: ${req.body?.customerName || 'Cash Customer'}`);
    }
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

    // Default required text fields to avoid validation rejections
    if (!invoiceData.customerName || invoiceData.customerName.trim() === '') {
      invoiceData.customerName = invoiceData.partyName || "Cash Customer";
    }
    if (!invoiceData.businessName || invoiceData.businessName.trim() === '') {
      invoiceData.businessName = invoiceData.sellerName || "My Business";
    }

    // Generate invoice number if not provided
    if (!invoiceData.invoiceNumber || invoiceData.invoiceNumber.trim() === '') {
      const count = await Invoice.countDocuments({ userId: req.user.id, isDeleted: false });
      invoiceData.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(5, '0')}`;
    }

    if (!invoiceData.dueDate) {
      const baseDate = invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date();
      invoiceData.dueDate = new Date(baseDate.getTime() + 15 * 24 * 60 * 60 * 1000);
    }

    // Resolve templateId if preset key is provided
    if (invoiceData.templateId && typeof invoiceData.templateId === 'string' && !mongoose.Types.ObjectId.isValid(invoiceData.templateId)) {
      try {
        const InvoiceTemplate = mongoose.models.InvoiceTemplate;
        if (InvoiceTemplate) {
          const cleanKey = invoiceData.templateId.replace(/^tpl-/, "");
          const matched = await InvoiceTemplate.findOne({
            $or: [
              { "config.layout": cleanKey },
              { name: new RegExp(`^${cleanKey.replace(/-/g, " ")}$`, "i") }
            ]
          });
          if (matched) {
            invoiceData.templateId = matched._id;
          }
        }
      } catch (tErr) {
        // Fallback to storing as string/mixed
      }
    }

    // Authoritative Server-Side Calculation & Validation (DEF-INV-03 & DEF-INV-05)
    const calcResult = calculateAndValidateInvoice(invoiceData);
    if (!calcResult.valid) {
      return res.status(calcResult.statusCode || 400).json({
        message: calcResult.error,
        error: "Invoice calculation validation failed"
      });
    }

    // Validate and recalculate invoice line items, tax breakdown, subtotal, and grand total using authoritative calculation rules
    const validatedData = validateAndRecalculateInvoice(invoiceData, invoiceData.businessState || "Tamil Nadu");
    invoiceData.stateOfSupply = validatedData.stateOfSupply;
    invoiceData.businessState = validatedData.businessState;
    if (Array.isArray(validatedData.items) && validatedData.items.length > 0) {
      invoiceData.items = validatedData.items;
    }
    invoiceData.subtotal = validatedData.subtotal;
    invoiceData.taxAmount = validatedData.taxAmount;
    invoiceData.cgst = validatedData.cgst;
    invoiceData.sgst = validatedData.sgst;
    invoiceData.igst = validatedData.igst;
    invoiceData.shippingCharges = validatedData.shippingCharges;
    invoiceData.packagingCharges = validatedData.packagingCharges;
    invoiceData.freightCharges = validatedData.freightCharges;
    invoiceData.adjustment = validatedData.adjustment;
    invoiceData.grandTotal = validatedData.grandTotal;
    invoiceData.amountPaid = validatedData.amountPaid;
    invoiceData.balanceDue = validatedData.balanceDue;
    invoiceData.paymentStatus = validatedData.paymentStatus;
    if (invoiceData.balanceDue === 0 && invoiceData.grandTotal > 0) {
      invoiceData.status = 'paid';
    } else if (invoiceData.amountPaid > 0 && invoiceData.status === 'draft') {
      invoiceData.status = 'sent';
    }

    const newInvoice = new Invoice(invoiceData);
    await newInvoice.save();

    // If initial payment was recorded at creation, persist Payment audit record
    const validatedPaid = validatedData.amountPaid || 0;
    let initialPayment = null;
    if (validatedPaid > 0) {
      initialPayment = new Payment({
        userId: newInvoice.userId || req.user?.id,
        invoiceId: newInvoice._id,
        paymentNumber: `PMT-${newInvoice.invoiceNumber}-01`,
        amount: validatedPaid,
        paymentDate: newInvoice.invoiceDate || new Date(),
        paymentMethod: newInvoice.paymentMethod || 'cash',
        depositAccount: "Cash/Bank",
        referenceNumber: `init_${newInvoice.invoiceNumber}`,
        notes: "Initial payment recorded during invoice creation.",
        idempotencyKey: `init_${newInvoice._id}`
      });
      await initialPayment.save();
    }

    // Automatically generate Bookkeeping Entry for sales invoice payment
    // Credit pota or pay panatha amount bookkeeping-la kata kudathu.
    // Only actual paid/collected amount is recorded as income in bookkeeping.
    const invUserId = newInvoice.userId || req.user?.id;
    if (invUserId && invUserId !== "000000000000000000000000") {
      const isCredit = String(newInvoice.paymentMethod || newInvoice.saleType || "").trim().toLowerCase() === "credit";
      const paidIncome = Number(newInvoice.amountPaid !== undefined ? newInvoice.amountPaid : (newInvoice.paid || 0));

      if (paidIncome > 0) {
        await upsertAutomatedBookkeepingEntry({
          userId: invUserId,
          date: newInvoice.invoiceDate || new Date(),
          description: `Sales Invoice ${newInvoice.invoiceNumber}${isCredit ? " (Partial Payment)" : ""} to ${newInvoice.customerName}`,
          category: "Sales",
          amount: paidIncome,
          type: "income",
          referenceId: `invoice_${newInvoice._id}`
        });
      } else {
        await removeAutomatedBookkeepingEntry({
          userId: invUserId,
          referenceId: `invoice_${newInvoice._id}`
        });
      }
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
    const invoice = await Invoice.findOne(buildInvoiceQuery(req.params.id, req, { isDeleted: false })).lean();

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

    // Find existing invoice first
    const currentInvoice = await Invoice.findOne(buildInvoiceQuery(req.params.id, req, { isDeleted: false }));
    if (!currentInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Recalculate totals if items or place of supply are updated
    if (Array.isArray(updateData.items) && updateData.items.length > 0) {
      const mergedInvoice = {
        ...(currentInvoice.toObject ? currentInvoice.toObject() : currentInvoice),
        ...updateData,
        items: updateData.items
      };
      const calcResult = calculateAndValidateInvoice(mergedInvoice);
      if (!calcResult.valid) {
        return res.status(calcResult.statusCode || 400).json({
          message: calcResult.error,
          error: "Invoice calculation validation failed"
        });
      }
      const validatedData = validateAndRecalculateInvoice(mergedInvoice, mergedInvoice.businessState || "Tamil Nadu");
      updateData.items = validatedData.items;
      updateData.subtotal = validatedData.subtotal;
      updateData.taxAmount = validatedData.taxAmount;
      updateData.cgst = validatedData.cgst;
      updateData.sgst = validatedData.sgst;
      updateData.igst = validatedData.igst;
      updateData.shippingCharges = validatedData.shippingCharges;
      updateData.packagingCharges = validatedData.packagingCharges;
      updateData.freightCharges = validatedData.freightCharges;
      updateData.adjustment = validatedData.adjustment;
      updateData.grandTotal = validatedData.grandTotal;
      updateData.amountPaid = validatedData.amountPaid;
      updateData.balanceDue = validatedData.balanceDue;
      updateData.paymentStatus = validatedData.paymentStatus;
      if (updateData.balanceDue === 0 && updateData.grandTotal > 0) {
        updateData.status = 'paid';
      }
    } else if (updateData.amountPaid !== undefined || updateData.grandTotal !== undefined) {
      const grandTotal = Math.round((Number(updateData.grandTotal !== undefined ? updateData.grandTotal : currentInvoice.grandTotal) || 0) * 100) / 100;
      const requestedPaid = Math.round((Number(updateData.amountPaid !== undefined ? updateData.amountPaid : currentInvoice.amountPaid) || 0) * 100) / 100;
      const validatedPaid = Math.min(grandTotal, Math.max(0, requestedPaid));
      updateData.grandTotal = grandTotal;
      updateData.amountPaid = validatedPaid;
      updateData.balanceDue = Math.max(0, Math.round((grandTotal - validatedPaid) * 100) / 100);

      // Update payment status based on balance
      if (updateData.balanceDue === 0 && grandTotal > 0) {
        updateData.paymentStatus = 'paid';
        updateData.status = 'paid';
      } else if (validatedPaid > 0) {
        updateData.paymentStatus = 'partial';
      } else {
        updateData.paymentStatus = 'pending';
      }
    }

    // Strip protected identity fields
    delete updateData.userId;
    delete updateData.createdBy;
    updateData.updatedAt = new Date();

    if (updateData.templateId && typeof updateData.templateId === 'string' && !mongoose.Types.ObjectId.isValid(updateData.templateId)) {
      try {
        const InvoiceTemplate = mongoose.models.InvoiceTemplate;
        if (InvoiceTemplate) {
          const cleanKey = updateData.templateId.replace(/^tpl-/, "");
          const matched = await InvoiceTemplate.findOne({
            $or: [
              { "config.layout": cleanKey },
              { name: new RegExp(`^${cleanKey.replace(/-/g, " ")}$`, "i") }
            ]
          });
          if (matched) {
            updateData.templateId = matched._id;
          }
        }
      } catch (tErr) {
        // Fallback to storing as string/mixed
      }
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: currentInvoice._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    // Sync automated Bookkeeping Entry
    // Credit pota or pay panatha amount bookkeeping-la kata kudathu.
    // Only actual paid/collected amount is recorded as income in bookkeeping.
    const invUserId = updatedInvoice.userId || req.user?.id;
    if (invUserId && invUserId !== "000000000000000000000000") {
      const isCredit = String(updatedInvoice.paymentMethod || updatedInvoice.saleType || "").trim().toLowerCase() === "credit";
      const paidIncome = Number(updatedInvoice.amountPaid !== undefined ? updatedInvoice.amountPaid : (updatedInvoice.paid || 0));

      if (updatedInvoice.status === 'cancelled' || updatedInvoice.isDeleted || paidIncome <= 0) {
        await removeAutomatedBookkeepingEntry({
          userId: invUserId,
          referenceId: `invoice_${updatedInvoice._id}`
        });
      } else {
        await upsertAutomatedBookkeepingEntry({
          userId: invUserId,
          date: updatedInvoice.invoiceDate || new Date(),
          description: `Sales Invoice ${updatedInvoice.invoiceNumber}${isCredit ? " (Partial Payment)" : ""} to ${updatedInvoice.customerName}`,
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

// ✅ 6. Delete Invoice (Hard Delete & Cascade to Bookkeeping/Payments)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const invoiceToDelete = await Invoice.findOne(buildInvoiceQuery(req.params.id, req));

    if (!invoiceToDelete) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    // Delete the invoice permanently
    await Invoice.deleteOne({ _id: invoiceToDelete._id });

    // 1. Remove automated Bookkeeping Entry associated with this invoice and its payments
    const invUserId = invoiceToDelete.userId || req.user?.id;
    const invoicePayments = await Payment.find({
      $or: [
        { invoiceId: invoiceToDelete._id },
        { invoiceNumber: invoiceToDelete.invoiceNumber }
      ]
    });
    const paymentRefIds = invoicePayments.map(p => `payment_${p._id}`);

    const refIds = [
      `invoice_${invoiceToDelete._id}`,
      `invoice_${invoiceToDelete.invoiceNumber}`,
      invoiceToDelete.id ? `invoice_${invoiceToDelete.id}` : null,
      ...paymentRefIds
    ].filter(Boolean);

    await BookkeepingEntry.deleteMany({
      $or: [
        { referenceId: { $in: refIds } },
        { description: new RegExp(`Sales Invoice ${invoiceToDelete.invoiceNumber}\\b`, 'i') }
      ]
    });

    // 2. Remove Payments recorded against this invoice
    await Payment.deleteMany({
      $or: [
        { invoiceId: invoiceToDelete._id },
        { invoiceNumber: invoiceToDelete.invoiceNumber }
      ]
    });

    // 3. Cascade restore Inventory stock for all items in this invoice
    try {
      const InventoryItem = mongoose.models.InventoryItem;
      if (InventoryItem && Array.isArray(invoiceToDelete.items)) {
        for (const item of invoiceToDelete.items) {
          const qty = Number(item.quantity) || 0;
          if (qty <= 0) continue;

          const orConditions = [];
          if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(item.productId) });
          }
          if (item.inventoryItemId && mongoose.Types.ObjectId.isValid(item.inventoryItemId)) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(item.inventoryItemId) });
          }
          if (item.sku || item.itemCode) {
            orConditions.push({ sku: item.sku || item.itemCode });
          }
          const prodName = item.productName || item.itemName;
          if (prodName) {
            orConditions.push({ itemName: new RegExp(`^${prodName.trim()}$`, 'i') });
          }

          if (orConditions.length > 0) {
            const invQuery = { $or: orConditions };
            if (invUserId && invUserId !== "000000000000000000000000") {
              invQuery.userId = mongoose.Types.ObjectId.isValid(invUserId)
                ? { $in: [new mongoose.Types.ObjectId(invUserId), invUserId] }
                : invUserId;
            }

            const invDoc = await InventoryItem.findOne(invQuery);
            if (invDoc) {
              invDoc.quantity = (invDoc.quantity || 0) + qty;
              invDoc.lastUpdated = new Date();
              await invDoc.save();
            }
          }
        }
      }
    } catch (invErr) {
      console.warn("Failed to restore inventory stock on delete:", invErr.message);
    }

    res.json({
      message: "Invoice deleted successfully!",
      deletedInvoice: {
        _id: invoiceToDelete._id,
        invoiceNumber: invoiceToDelete.invoiceNumber
      }
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

    const targetInvoice = await Invoice.findOne(buildInvoiceQuery(req.params.id, req, { isDeleted: false }));

    if (!targetInvoice) {
      return res.status(404).json({
        message: "Invoice not found"
      });
    }

    targetInvoice.status = status;
    targetInvoice.updatedAt = new Date();
    const updatedInvoice = await targetInvoice.save();

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

// ✅ 8. Update Payment Status (with Idempotency, Capping, & Audit Trail)
router.all("/:id/payment", verifyToken, async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const {
      amount,
      amountPaid,
      paymentMethod,
      paymentDate,
      paymentStatus,
      referenceNumber,
      transactionReference,
      notes,
      depositAccount
    } = req.body;

    const userFilter = getUserFilter(req);
    const idempotencyKey = String(req.body.idempotencyKey || req.headers['idempotency-key'] || referenceNumber || transactionReference || "").trim();

    let invoice = await Invoice.findOne({
      ...getInvoiceIdFilter(req.params.id),
      isDeleted: false,
      ...userFilter
    });
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // 1. Idempotency Check: prevent duplicate processing on retries or double-clicks
    if (idempotencyKey) {
      const existingPayment = await Payment.findOne({
        invoiceId: invoice._id,
        idempotencyKey
      });
      if (existingPayment) {
        return res.json({
          message: "Payment already recorded (idempotent duplicate)",
          invoice,
          payment: existingPayment,
          isDuplicate: true
        });
      }
    }

    // 2. Handle Credit (Unpaid) or parse payment amount
    const isCredit = Boolean(req.body.isCredit || String(paymentMethod || '').toLowerCase() === 'credit');
    const grandTotal = Math.round((Number(invoice.grandTotal) || 0) * 100) / 100;
    const currentPaid = Math.round((Number(invoice.amountPaid) || 0) * 100) / 100;

    let payAmt = 0;
    if (amount !== undefined && amount !== null && !isNaN(parseFloat(amount))) {
      payAmt = parseFloat(amount);
    } else if (amountPaid !== undefined && amountPaid !== null && !isNaN(parseFloat(amountPaid))) {
      payAmt = parseFloat(amountPaid);
    }
    payAmt = Math.round(payAmt * 100) / 100;

    // Handle credit sale: if amount is 0, isCredit is true, or amount equals grandTotal (accidental prefill), reset to Unpaid
    if (isCredit && (payAmt <= 0 || req.body.isCredit || payAmt === grandTotal)) {
      invoice.amountPaid = 0;
      invoice.balanceDue = grandTotal;
      invoice.paymentStatus = 'pending';
      invoice.status = 'sent';
      invoice.paymentMethod = 'credit';
      if (paymentDate) invoice.invoiceDate = new Date(paymentDate);
      invoice.updatedAt = new Date();
      await invoice.save();

      if (invoice.userId && invoice.userId !== "000000000000000000000000") {
        await removeAutomatedBookkeepingEntry({
          userId: invoice.userId,
          referenceId: `invoice_${invoice._id}`
        });
      }

      return res.json({
        message: "Invoice marked as Credit (Unpaid)",
        invoice
      });
    }

    if (isNaN(payAmt) || payAmt <= 0) {
      return res.status(400).json({ message: "Invalid payment amount. Amount must be greater than 0." });
    }

    const currentBalance = Math.max(0, Math.round((grandTotal - currentPaid) * 100) / 100);

    if (req.body.isCumulative) {
      if (payAmt > grandTotal + 0.01) {
        return res.status(400).json({
          message: `Payment amount (₹${payAmt.toFixed(2)}) cannot exceed invoice total (₹${grandTotal.toFixed(2)}).`,
          grandTotal,
          amountPaid: currentPaid,
          balanceDue: currentBalance
        });
      }
    } else {
      if (payAmt > currentBalance + 0.01) {
        return res.status(400).json({
          message: `Payment amount (₹${payAmt.toFixed(2)}) cannot exceed remaining balance (₹${currentBalance.toFixed(2)}).`,
          grandTotal,
          amountPaid: currentPaid,
          balanceDue: currentBalance
        });
      }
    }

    // Incremental payment towards remaining balance
    let newAmountPaid;
    if (req.body.isCumulative) {
      newAmountPaid = Math.min(grandTotal, payAmt);
    } else {
      newAmountPaid = Math.min(grandTotal, Math.round((currentPaid + payAmt) * 100) / 100);
    }

    const newBalanceDue = Math.max(0, Math.round((grandTotal - newAmountPaid) * 100) / 100);
    const newStatus = newBalanceDue <= 0 ? 'paid' : 'sent';
    const newPaymentStatus = newBalanceDue <= 0 ? 'paid' : (newAmountPaid > 0 ? 'partial' : 'pending');

    // 3. Persist Payment audit record
    const pCount = await Payment.countDocuments({ invoiceId: invoice._id });
    const paymentNumber = `PMT-${invoice.invoiceNumber || invoice._id}-${(pCount + 1).toString().padStart(2, '0')}`;
    const paymentRecord = new Payment({
      userId: invoice.userId || req.user?.id,
      invoiceId: invoice._id,
      paymentNumber,
      amount: payAmt,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
      depositAccount: depositAccount || "Cash/Bank",
      referenceNumber: referenceNumber || transactionReference || idempotencyKey || "",
      notes: notes || `Payment received against invoice ${invoice.invoiceNumber}`,
      idempotencyKey: idempotencyKey || ""
    });
    await paymentRecord.save();

    // 4. Update Invoice
    invoice.amountPaid = newAmountPaid;
    invoice.balanceDue = newBalanceDue;
    invoice.paymentStatus = paymentStatus || newPaymentStatus;
    invoice.status = newStatus;
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

    // 5. Update Double-Entry Ledger (Debit Cash/Bank, Credit Accounts Receivable)
    try {
      const LedgerAccount = mongoose.models.LedgerAccount || mongoose.model("LedgerAccount");
      if (LedgerAccount && invoice.userId) {
        const [cashAcc, arAcc] = await Promise.all([
          LedgerAccount.findOne({ userId: invoice.userId, name: "Cash/Bank" }),
          LedgerAccount.findOne({ userId: invoice.userId, name: "Accounts Receivable" })
        ]);
        if (cashAcc) {
          cashAcc.balance = Math.round((cashAcc.balance + payAmt) * 100) / 100;
          await cashAcc.save();
        }
        if (arAcc) {
          arAcc.balance = Math.round((arAcc.balance - payAmt) * 100) / 100;
          await arAcc.save();
        }
      }
    } catch (ledgerErr) {
      console.warn("Ledger sync notice:", ledgerErr.message);
    }

    // 6. Sync automated Bookkeeping Entry with actual collected cash for this invoice
    try {
      const invUserId = invoice.userId || req.user?.id;
      if (invUserId && invUserId !== "000000000000000000000000") {
        if (newAmountPaid > 0) {
          await upsertAutomatedBookkeepingEntry({
            userId: invUserId,
            date: paymentDate ? new Date(paymentDate) : (invoice.invoiceDate || new Date()),
            description: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
            category: "Sales",
            amount: invoice.grandTotal,
            type: "income",
            referenceId: `invoice_${invoice._id}`
          });
        }
      }
    } catch (bkErr) {
      console.warn("Bookkeeping payment sync notice:", bkErr.message);
    }

    res.json({
      message: "Payment recorded successfully!",
      invoice,
      payment: paymentRecord
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
