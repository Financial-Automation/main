import express from "express";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Category from "../models/Category.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Middleware to verify token (with fallback for optional auth / guest mode)
const verifyToken = (req, res, next) => {
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

// ✅ POST route to add bookkeeping entry (manual & automated)
router.post("/add", verifyToken, async (req, res) => {

    try {
        const { date, description, type, amount, category, referenceId, isAutomated } = req.body;
        const entryType = (type && (type.toString().toLowerCase() === "income")) ? "income" : "expense";
        const entryDate = date ? new Date(date) : new Date();
        const parsedAmount = parseFloat(amount);

        if (isNaN(parsedAmount) || !description) {
            return res.status(400).json({ message: "Valid amount and description are required" });
        }

        const newEntry = new BookkeepingEntry({
            userId: req.user.id,
            date: isNaN(entryDate.getTime()) ? new Date() : entryDate,
            description,
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

// ✅ GET route to fetch all bookkeeping entries (for the logged-in user)
router.get("/all", verifyToken, async (req, res) => {
    try {
        const entries = await BookkeepingEntry.find({ userId: req.user.id }).sort({ date: -1 });

        // Calculate totals
        const totalIncome = entries
            .filter(entry => entry.type === 'income') // Note: model uses lowercase 'income'
            .reduce((sum, entry) => sum + entry.amount, 0);

        const totalExpenses = entries
            .filter(entry => entry.type === 'expense') // Note: model uses lowercase 'expense'
            .reduce((sum, entry) => sum + entry.amount, 0);

        const netBalance = totalIncome - totalExpenses;

        res.json({
            entries,
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                entryCount: entries.length
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
        const deletedEntry = await BookkeepingEntry.findOneAndDelete({ _id: id, userId: req.user.id });

        if (!deletedEntry) {
            return res.status(404).json({ message: "Entry not found or unauthorized" });
        }

        res.json({ message: "Entry deleted successfully", deletedEntry });
    } catch (error) {
        console.error("Error deleting bookkeeping entry:", error);
        res.status(500).json({ message: "Error deleting bookkeeping entry", error });
    }
});

// ✅ GET route for financial summary
router.get("/summary", verifyToken, async (req, res) => {
    try {
        const entries = await BookkeepingEntry.find({ userId: req.user.id });

        const totalIncome = entries
            .filter(entry => entry.type === 'income')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const totalExpenses = entries
            .filter(entry => entry.type === 'expense')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const netBalance = totalIncome - totalExpenses;

        // Category-wise breakdown
        const categoryBreakdown = entries.reduce((acc, entry) => {
            if (!acc[entry.category]) {
                acc[entry.category] = { income: 0, expenses: 0 };
            }
            if (entry.type === 'income') {
                acc[entry.category].income += entry.amount;
            } else {
                acc[entry.category].expenses += entry.amount;
            }
            return acc;
        }, {});

        res.json({
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                entryCount: entries.length
            },
            categoryBreakdown
        });
    } catch (error) {
        console.error("Error generating summary:", error);
        res.status(500).json({ message: "Error generating financial summary", error });
    }
});

// ✅ GET route to fetch all categories for the user
router.get("/categories", verifyToken, async (req, res) => {
    try {
        const customCategories = await Category.find({ userId: req.user.id });
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