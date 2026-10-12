import express from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Helper to get user filter for tenant isolation
const getUserFilter = (req) => {
  const userIdStr = req.user?.id || req.user?._id?.toString();
  if (!userIdStr) return { userId: null };
  return mongoose.Types.ObjectId.isValid(userIdStr)
    ? { userId: new mongoose.Types.ObjectId(userIdStr) }
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

// 1. Create Customer
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, companyName, email, phone, billingAddress, shippingAddress, gstin, placeOfSupply, paymentTerms, notes, status } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    const userFilter = getUserFilter(req);
    const userId = req.user.id || req.user._id;

    // Check for duplicate customer name under same user
    const existing = await Customer.findOne({
      ...userFilter,
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({ message: `Customer with name '${name.trim()}' already exists.` });
    }

    const newCustomer = new Customer({
      userId,
      name: name.trim(),
      companyName: companyName ? companyName.trim() : "",
      email: email ? email.trim() : "",
      phone: phone ? phone.trim() : "",
      billingAddress: billingAddress ? billingAddress.trim() : "",
      shippingAddress: shippingAddress ? shippingAddress.trim() : "",
      gstin: gstin ? gstin.trim().toUpperCase() : "",
      placeOfSupply: placeOfSupply ? placeOfSupply.trim() : "",
      paymentTerms: paymentTerms || "Due on Receipt",
      notes: notes ? notes.trim() : "",
      status: status && ["active", "inactive"].includes(status) ? status : "active"
    });

    await newCustomer.save();
    res.status(201).json({
      message: "Customer created successfully!",
      customer: newCustomer
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    res.status(500).json({ message: "Failed to create customer", error: error.message });
  }
});

// 2. Get All Customers (with search, filter, pagination)
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

      const [customers, total] = await Promise.all([
        Customer.find(queryFilter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
        Customer.countDocuments(queryFilter)
      ]);

      return res.json({
        customers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      });
    }

    // Default: return array of customers capped at 100 items for dropdown selectors
    const maxLimit = limit ? Math.min(parseInt(limit, 10), 200) : 100;
    const customers = await Customer.find(queryFilter).sort({ name: 1 }).limit(maxLimit).lean();
    res.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ message: "Failed to fetch customers", error: error.message });
  }
});

// 3. Get Customer Detail (with Aggregated Financial Metrics)
router.get("/:id/detail", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const customer = await Customer.findOne({ _id: req.params.id, ...userFilter }).lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const Invoice = mongoose.models.Invoice || mongoose.model("Invoice");

    // Fetch invoices for this customer
    const invoices = Invoice ? await Invoice.find({
      ...userFilter,
      isDeleted: false,
      $or: [
        { customerId: customer._id },
        { customerName: { $regex: new RegExp(`^${customer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    }).sort({ invoiceDate: -1 }).lean() : [];

    const now = new Date();
    let totalInvoiced = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;
    let overdueAmount = 0;

    const recentInvoices = [];
    const outstandingInvoices = [];
    const paymentHistory = [];

    invoices.forEach(inv => {
      const grandTotal = inv.grandTotal || 0;
      const paid = inv.amountPaid || 0;
      const balance = inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, grandTotal - paid);

      totalInvoiced += grandTotal;
      totalPaid += paid;
      outstandingBalance += balance;

      const isOverdue = balance > 0 && inv.dueDate && new Date(inv.dueDate) < now && inv.paymentStatus !== "paid";
      if (isOverdue) {
        overdueAmount += balance;
      }

      const invoiceItem = {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        grandTotal,
        amountPaid: paid,
        balanceDue: balance,
        paymentStatus: inv.paymentStatus,
        status: inv.status,
        isOverdue
      };

      if (recentInvoices.length < 10) {
        recentInvoices.push(invoiceItem);
      }

      if (balance > 0) {
        outstandingInvoices.push(invoiceItem);
      }

      if (paid > 0) {
        paymentHistory.push({
          invoiceId: inv._id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.updatedAt || inv.invoiceDate,
          amountPaid: paid,
          paymentMethod: inv.paymentMethod || "cash"
        });
      }
    });

    res.json({
      customer,
      financialSummary: {
        totalInvoiced,
        totalPaid,
        outstandingBalance,
        overdueAmount,
        invoiceCount: invoices.length,
        outstandingCount: outstandingInvoices.length
      },
      recentInvoices,
      outstandingInvoices,
      paymentHistory
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({ message: "Failed to fetch customer detail profile", error: error.message });
  }
});

// 4. Get Single Customer
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const customer = await Customer.findOne({ _id: req.params.id, ...userFilter }).lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ message: "Failed to fetch customer", error: error.message });
  }
});

// 5. Update Customer
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const updateData = { ...req.body };
    delete updateData.userId;
    delete updateData._id;
    updateData.updatedAt = new Date();

    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...userFilter },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({
      message: "Customer updated successfully!",
      customer: updatedCustomer
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ message: "Failed to update customer", error: error.message });
  }
});

// 6. Delete or Soft-Deactivate Customer
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const customer = await Customer.findOne({ _id: req.params.id, ...userFilter });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const Invoice = mongoose.models.Invoice || mongoose.model("Invoice");
    const hasInvoices = Invoice ? await Invoice.exists({
      ...userFilter,
      isDeleted: false,
      $or: [
        { customerId: customer._id },
        { customerName: { $regex: new RegExp(`^${customer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    }) : false;

    if (hasInvoices) {
      // Soft-deactivate if financial history exists
      customer.status = "inactive";
      customer.updatedAt = new Date();
      await customer.save();
      return res.json({
        message: "Customer deactivated successfully (financial history preserved).",
        customer,
        deactivated: true
      });
    }

    // Hard delete if no financial history exists
    await Customer.deleteOne({ _id: req.params.id, ...userFilter });

    res.json({
      message: "Customer deleted successfully!",
      deleted: true
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ message: "Failed to delete customer", error: error.message });
  }
});

export default router;
