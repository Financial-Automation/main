import express from "express";
import mongoose from "mongoose";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Category from "../models/Category.js";
import Invoice from "../models/Invoice.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Helper to construct tenant filter supporting ObjectId and String userId
const getUserIdMatchFilter = (userIdStr) => {
    if (!userIdStr) return { userId: null };
    const isObjId = mongoose.Types.ObjectId.isValid(userIdStr);
    const objId = isObjId ? new mongoose.Types.ObjectId(userIdStr) : null;
    return objId
        ? { $or: [{ userId: objId }, { userId: userIdStr }] }
        : { userId: userIdStr };
};

/**
 * Ensures credit sales without payment or unpaid invoice amounts are NOT shown in bookkeeping.
 * Only actual collected/paid income amounts appear in bookkeeping.
 */
const filterValidBookkeepingEntries = async (entries) => {
    try {
        const paymentRefs = entries
            .filter(e => e.referenceId && typeof e.referenceId === 'string' && e.referenceId.startsWith('payment_'))
            .map(e => e.referenceId.replace(/^payment_/, ''));

        const invoiceRefs = entries
            .filter(e => e.referenceId && typeof e.referenceId === 'string' && e.referenceId.startsWith('invoice_'))
            .map(e => e.referenceId.replace(/^invoice_/, ''));

        let matchedPayments = [];
        if (paymentRefs.length > 0) {
            const PaymentModel = mongoose.models.Payment || (await import("../models/Payment.js")).default;
            matchedPayments = await PaymentModel.find({
                _id: { $in: paymentRefs.filter(id => mongoose.Types.ObjectId.isValid(id)) }
            }).lean();
        }

        const paymentMap = new Map();
        const paymentInvoiceIds = [];
        matchedPayments.forEach(p => {
            paymentMap.set(String(p._id), p);
            if (p.invoiceId) paymentInvoiceIds.push(p.invoiceId);
        });

        const allInvoiceIds = [...invoiceRefs, ...paymentInvoiceIds].filter(id => mongoose.Types.ObjectId.isValid(id));
        const matchedInvoices = await Invoice.find({
            _id: { $in: allInvoiceIds }
        }).lean();

        const invoiceMap = new Map();
        matchedInvoices.forEach(inv => invoiceMap.set(String(inv._id), inv));

        return entries.filter(entry => {
            if (!entry.referenceId || typeof entry.referenceId !== 'string') return true;

            // 1. Payment-level entries: each represents an individual collected payment (e.g. ₹499, ₹681)
            if (entry.referenceId.startsWith('payment_')) {
                const payId = entry.referenceId.replace(/^payment_/, '');
                const payment = paymentMap.get(payId);
                if (payment && payment.invoiceId) {
                    const inv = invoiceMap.get(String(payment.invoiceId));
                    if (inv && (inv.isDeleted || inv.status === 'cancelled')) {
                        return false;
                    }
                }
                return true;
            }

            // 2. Legacy invoice-level entries
            if (entry.referenceId.startsWith('invoice_')) {
                const invId = entry.referenceId.replace(/^invoice_/, '');
                const inv = invoiceMap.get(invId);
                if (!inv) return true;

                if (inv.isDeleted || inv.status === 'cancelled') return false;

                const isCredit = String(inv.paymentMethod || inv.saleType || '').trim().toLowerCase() === 'credit';
                const paid = Number(inv.amountPaid !== undefined ? inv.amountPaid : (inv.paid || 0));

                if (isCredit && paid <= 0) return false;
                if (paid <= 0 && inv.status !== 'paid' && inv.paymentStatus !== 'paid') return false;

                return true;
            }

            return true;
        });
    } catch (err) {
        console.warn("Bookkeeping filter notice:", err.message);
        return entries;
    }
};

// Middleware to verify token (strict authentication, no dummy fallback - DEF-BK-01)
const verifyToken = (req, res, next) => {
    if (req.user && (req.user.id || req.user._id) && req.user.id !== "000000000000000000000000") {
        return next();
    }
    const token = req.headers.authorization?.split(" ")[1];
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";

    if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            ...decoded,
            id: decoded.id || decoded._id?.toString()
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

// ✅ POST route to add bookkeeping entry (manual & automated)
router.post("/add", verifyToken, async (req, res) => {
    try {
        const { date, description, type, amount, category, referenceId, isAutomated } = req.body;
        const entryType = (type && (type.toString().toLowerCase() === "income")) ? "income" : "expense";
        const entryDate = date ? new Date(date) : new Date();
        const parsedAmount = parseFloat(amount);

        // Server-side financial validation (DEF-BK-04)
        if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ message: "Amount must be a positive number" });
        }

        if (!description || typeof description !== "string" || !description.trim()) {
            return res.status(400).json({ message: "Valid description is required" });
        }

        const newEntry = new BookkeepingEntry({
            userId: req.user.id,
            date: isNaN(entryDate.getTime()) ? new Date() : entryDate,
            description: description.trim(),
            type: entryType,
            amount: parsedAmount,
            category: category || "General",
            referenceId: referenceId || null,
            isAutomated: isAutomated || false
        });
        await newEntry.save();
        res.status(201).json({
            message: "Bookkeeping entry saved successfully!",
            entry: newEntry
        });
    } catch (error) {
        console.error("Error saving bookkeeping entry:", error);
        res.status(500).json({ message: "Error saving bookkeeping entry", error: error.message || error });
    }
});

// ✅ PUT route to update an existing bookkeeping entry (DEF-BK-02 & DEF-BK-04)
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { date, description, type, amount, category } = req.body;

        const updateFields = {};

        if (amount !== undefined) {
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ message: "Amount must be a positive number" });
            }
            updateFields.amount = parsedAmount;
        }

        if (description !== undefined) {
            if (typeof description !== "string" || !description.trim()) {
                return res.status(400).json({ message: "Description cannot be empty" });
            }
            updateFields.description = description.trim();
        }

        if (type !== undefined) {
            const entryType = type.toString().toLowerCase();
            if (!["income", "expense"].includes(entryType)) {
                return res.status(400).json({ message: "Type must be either 'income' or 'expense'" });
            }
            updateFields.type = entryType;
        }

        if (date !== undefined) {
            const entryDate = new Date(date);
            if (isNaN(entryDate.getTime())) {
                return res.status(400).json({ message: "Invalid date format" });
            }
            updateFields.date = entryDate;
        }

        if (category !== undefined) {
            updateFields.category = category || "General";
        }

        // Single optimized database query bypassing double lookup
        const updatedEntry = await BookkeepingEntry.findOneAndUpdate(
            { _id: id, userId: req.user.id },
            { $set: updateFields },
            { new: true, runValidators: true }
        ).lean();

        if (!updatedEntry) {
            return res.status(404).json({ message: "Entry not found or unauthorized" });
        }

        res.json({
            message: "Bookkeeping entry updated successfully!",
            entry: updatedEntry
        });
    } catch (error) {
        console.error("Error updating bookkeeping entry:", error);
        res.status(500).json({ message: "Error updating bookkeeping entry", error: error.message || error });
    }
});

// ✅ GET route to fetch all bookkeeping entries (for the logged-in user)
router.get("/all", verifyToken, async (req, res) => {
    try {
        const { search, category, type, isAutomated, startDate, endDate } = req.query;

        // Build dynamic MongoDB query filter
        const queryFilter = { userId: req.user.id };

        if (search && typeof search === 'string' && search.trim()) {
            queryFilter.description = { $regex: search.trim(), $options: 'i' };
        }

        if (category && typeof category === 'string' && category.trim()) {
            queryFilter.category = category.trim();
        }

        if (type && ['income', 'expense'].includes(type.toString().toLowerCase())) {
            queryFilter.type = type.toString().toLowerCase();
        }

        if (isAutomated !== undefined) {
            queryFilter.isAutomated = isAutomated === 'true' || isAutomated === true;
        }

        if (startDate || endDate) {
            queryFilter.date = {};
            if (startDate) {
                const sDate = new Date(startDate);
                if (!isNaN(sDate.getTime())) queryFilter.date.$gte = sDate;
            }
            if (endDate) {
                const eDate = new Date(endDate);
                if (!isNaN(eDate.getTime())) queryFilter.date.$lte = eDate;
            }
        }

        const rawEntries = await BookkeepingEntry.find(queryFilter).sort({ date: -1 }).lean();
        const validEntries = await filterValidBookkeepingEntries(rawEntries);

        // Calculate totals (case-insensitive to support legacy data safely)
        const totalIncome = validEntries
            .filter(entry => entry.type && entry.type.toString().toLowerCase() === 'income')
            .reduce((sum, entry) => sum + (entry.amount || 0), 0);

        const totalExpenses = validEntries
            .filter(entry => entry.type && entry.type.toString().toLowerCase() === 'expense')
            .reduce((sum, entry) => sum + (entry.amount || 0), 0);

        const netBalance = totalIncome - totalExpenses;
        const entryCount = validEntries.length;

        let entries = validEntries;
        let page = parseInt(req.query.page);
        let limit = parseInt(req.query.limit);
        const hasPagination = !isNaN(page) || !isNaN(limit);

        if (hasPagination) {
            if (isNaN(page) || page < 1) page = 1;
            if (isNaN(limit) || limit < 1) limit = 100;
            if (limit > 100) limit = 100;
            const skip = (page - 1) * limit;
            entries = validEntries.slice(skip, skip + limit);
        }

        const responsePayload = {
            entries,
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                entryCount
            }
        };

        if (hasPagination) {
            responsePayload.pagination = {
                page: page || 1,
                limit: limit || 100,
                totalEntries: entryCount,
                totalPages: Math.ceil(entryCount / (limit || 100))
            };
        }

        res.json(responsePayload);
    } catch (error) {
        console.error("Error fetching bookkeeping data:", error);
        res.status(500).json({ message: "Error fetching bookkeeping data" });
    }
});

// ✅ DELETE route to remove an entry
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const deletedEntry = await BookkeepingEntry.findOneAndDelete({ _id: id, userId: req.user.id }).lean();

        if (!deletedEntry) {
            return res.status(404).json({ message: "Entry not found or unauthorized" });
        }

        res.json({ message: "Entry deleted successfully", deletedEntry });
    } catch (error) {
        console.error("Error deleting bookkeeping entry:", error);
        res.status(500).json({ message: "Error deleting bookkeeping entry", error: error.message || error });
    }
});

// ✅ GET route for financial summary
router.get("/summary", verifyToken, async (req, res) => {
    try {
        const rawEntries = await BookkeepingEntry.find({ userId: req.user.id }).lean();
        const entries = await filterValidBookkeepingEntries(rawEntries);

        const totalIncome = entries
            .filter(entry => entry.type && entry.type.toString().toLowerCase() === 'income')
            .reduce((sum, entry) => sum + (entry.amount || 0), 0);

        const totalExpenses = entries
            .filter(entry => entry.type && entry.type.toString().toLowerCase() === 'expense')
            .reduce((sum, entry) => sum + (entry.amount || 0), 0);

        const netBalance = totalIncome - totalExpenses;
        const entryCount = entries.length;

        // Category-wise breakdown
        const categoryBreakdown = entries.reduce((acc, entry) => {
            const cat = entry.category || "General";
            if (!acc[cat]) {
                acc[cat] = { income: 0, expenses: 0 };
            }
            if (entry.type && entry.type.toString().toLowerCase() === 'income') {
                acc[cat].income += (entry.amount || 0);
            } else {
                acc[cat].expenses += (entry.amount || 0);
            }
            return acc;
        }, {});
        res.json({
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                entryCount
            },
            categoryBreakdown
        });
    } catch (error) {
        console.error("Error generating summary:", error);
        res.status(500).json({ message: "Error generating financial summary", error: error.message || error });
    }
});

// ✅ GET route to fetch all categories for the user
router.get("/categories", verifyToken, async (req, res) => {
    try {
        const customCategories = await Category.find({ userId: req.user.id }).lean();
        res.json({ categories: customCategories });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Error fetching categories" });
    }
});

// ✅ POST route to add a new category
router.post("/categories", verifyToken, async (req, res) => {
    try {
        const { name, type } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const newCategory = new Category({
            userId: req.user.id,
            name,
            type: type || "all"
        });

        await newCategory.save();
        res.status(201).json({
            message: "Category added successfully",
            category: newCategory
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Category name already exists" });
        }
        console.error("Error adding category:", error);
        res.status(500).json({ message: "Error adding category" });
    }
});

// ✅ DELETE route to remove a category
router.delete("/categories/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCategory = await Category.findOneAndDelete({ _id: id, userId: req.user.id });

        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found or unauthorized" });
        }

        res.json({ message: "Category deleted successfully", deletedCategory });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: "Error deleting category" });
    }
});

export default router;