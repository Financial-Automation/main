import express from "express";
import mongoose from "mongoose";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Category from "../models/Category.js";
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

        let page = parseInt(req.query.page) || 1;
        if (isNaN(page) || page < 1) page = 1;

        let limit = parseInt(req.query.limit) || 100;
        if (isNaN(limit) || limit < 1) limit = 100;
        if (limit > 100) limit = 100; // Enforce maximum limit of 100 entries per page

        const skip = (page - 1) * limit;

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

        const userMatchFilter = getUserIdMatchFilter(req.user.id);

        // Fetch paginated entries and aggregated totals without unbounded in-memory loading
        const [entries, totalMatchingEntries, summaryAgg] = await Promise.all([
            BookkeepingEntry.find(queryFilter)
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            BookkeepingEntry.countDocuments(queryFilter),
            BookkeepingEntry.aggregate([
                { $match: userMatchFilter },
                {
                    $group: {
                        _id: "$type",
                        totalAmount: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        let totalIncome = 0;
        let totalExpenses = 0;
        let entryCount = 0;

        summaryAgg.forEach(item => {
            entryCount += item.count || 0;
            if (item._id === 'income') {
                totalIncome = item.totalAmount || 0;
            } else if (item._id === 'expense') {
                totalExpenses = item.totalAmount || 0;
            }
        });

        const netBalance = totalIncome - totalExpenses;

        res.json({
            entries,
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                entryCount
            },
            pagination: {
                page,
                limit,
                totalEntries: totalMatchingEntries,
                totalPages: Math.ceil(totalMatchingEntries / limit)
            }
        });
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
        const userMatchFilter = getUserIdMatchFilter(req.user.id);

        const [typeAgg, categoryAgg] = await Promise.all([
            BookkeepingEntry.aggregate([
                { $match: userMatchFilter },
                {
                    $group: {
                        _id: "$type",
                        totalAmount: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                }
            ]),
            BookkeepingEntry.aggregate([
                { $match: userMatchFilter },
                {
                    $group: {
                        _id: { category: { $ifNull: ["$category", "General"] }, type: "$type" },
                        totalAmount: { $sum: "$amount" }
                    }
                }
            ])
        ]);

        let totalIncome = 0;
        let totalExpenses = 0;
        let entryCount = 0;

        typeAgg.forEach(item => {
            entryCount += item.count || 0;
            if (item._id === 'income') {
                totalIncome = item.totalAmount || 0;
            } else if (item._id === 'expense') {
                totalExpenses = item.totalAmount || 0;
            }
        });

        const categoryBreakdown = {};
        categoryAgg.forEach(item => {
            const cat = item._id.category || "General";
            if (!categoryBreakdown[cat]) {
                categoryBreakdown[cat] = { income: 0, expenses: 0 };
            }
            if (item._id.type === 'income') {
                categoryBreakdown[cat].income += item.totalAmount || 0;
            } else {
                categoryBreakdown[cat].expenses += item.totalAmount || 0;
            }
        });

        const netBalance = totalIncome - totalExpenses;

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