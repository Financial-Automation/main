import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Sale from "../models/Sale.js";
import Category from "../models/Category.js";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";

const router = express.Router();

// ✅ Inventory Schema
const inventorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    itemName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true },
    costPrice: { type: Number },
    buyPrice: { type: Number },
    category: { type: String, default: 'General' },
    gstRate: { type: Number, default: 0 }, // GST slab: 0, 5, 18, 28
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    stateOfSupply: { type: String, default: "" },
    lastUpdated: { type: Date, default: Date.now },
});

const InventoryItem = mongoose.model("InventoryItem", inventorySchema);

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
        const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ message: "Invalid token" });
    }
};

// ✅ POST route to add inventory item
router.post("/add", verifyToken, async (req, res) => {
    try {
        const { itemName, sku, quantity, price, category, gstRate, sgst, cgst, igst, stateOfSupply } = req.body;

        // Use new gstRate field, fallback to old sgst+cgst+igst for backward compatibility
        const effectiveGstRate = Number(gstRate) || (Number(sgst) || 0) + (Number(cgst) || 0) + (Number(igst) || 0);

        const newItem = new InventoryItem({
            userId: req.user.id,
            itemName,
            sku,
            quantity,
            price,
            costPrice: req.body.costPrice || req.body.buyPrice || undefined,
            buyPrice: req.body.buyPrice || req.body.costPrice || undefined,
            category,
            gstRate: effectiveGstRate,
            // Store split values for backward compatibility (50-50 split by default)
            sgst: effectiveGstRate / 2,
            cgst: effectiveGstRate / 2,
            igst: 0,
            stateOfSupply
        });
        await newItem.save();

        // Automatically generate Bookkeeping Entry for inventory stock addition if cost and quantity exist
        const unitCost = newItem.costPrice || newItem.buyPrice || newItem.price || 0;
        const totalStockValue = unitCost * (newItem.quantity || 0);
        if (totalStockValue > 0) {
            await upsertAutomatedBookkeepingEntry({
                userId: req.user.id,
                date: new Date(),
                description: `Inventory Stock Addition: ${newItem.itemName} (${newItem.quantity} units)`,
                category: "Inventory Stock",
                amount: totalStockValue,
                type: "expense",
                referenceId: `inv_add_${newItem._id}`
            });
        }

        res.status(201).json({
            message: "Item added successfully!",
            item: newItem
        });
    } catch (error) {
        console.error("Error adding inventory item:", error);
        res.status(500).json({ message: "Error adding item", error });
    }
});

// ✅ GET route to fetch all inventory items (User Specific)
router.get("/all", verifyToken, async (req, res) => {
    try {
        const items = await InventoryItem.find({ userId: req.user.id }).sort({ lastUpdated: -1 });
        res.json(items);
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ message: "Error fetching inventory" });
    }
});

// ✅ POST route to sell item (Decrement stock & Record Sale)
router.post("/sell/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantitySold, stateOfSupply } = req.body;

        const item = await InventoryItem.findOne({ _id: id, userId: req.user.id });
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        if (item.quantity < quantitySold) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        // Financial Calculations with GST logic based on state comparison
        const subtotal = item.price * quantitySold;
        const itemState = item.stateOfSupply || "";
        const sellState = stateOfSupply || itemState;

        // Determine if inter-state or intra-state
        const isInterState = itemState && sellState && itemState !== sellState;

        // Get the item's GST rate (fallback to old sgst+cgst+igst for backward compatibility)
        const itemGstRate = item.gstRate || ((item.sgst || 0) + (item.cgst || 0) + (item.igst || 0));

        let sgstRate, cgstRate, igstRate;
        let sgstAmount, cgstAmount, igstAmount;

        if (isInterState) {
            // Inter-state sale: Apply IGST at 18%
            sgstRate = 0;
            cgstRate = 0;
            igstRate = 18;
            sgstAmount = 0;
            cgstAmount = 0;
            igstAmount = (subtotal * 18) / 100;
        } else {
            // Intra-state sale: Split GST 50-50 into SGST + CGST
            sgstRate = itemGstRate / 2;
            cgstRate = itemGstRate / 2;
            igstRate = 0;
            sgstAmount = (subtotal * sgstRate) / 100;
            cgstAmount = (subtotal * cgstRate) / 100;
            igstAmount = 0;
        }

        const totalGstAmount = sgstAmount + cgstAmount + igstAmount;
        const totalGstRate = sgstRate + cgstRate + igstRate;
        const grandTotal = subtotal + totalGstAmount;

        // Create Sale Record with breakdown
        const newSale = new Sale({
            userId: req.user.id,
            inventoryItemId: item._id,
            itemName: item.itemName,
            sku: item.sku,
            quantitySold,
            unitPrice: item.price,
            subtotal,
            sgstRate,
            cgstRate,
            igstRate,
            sgstAmount,
            cgstAmount,
            igstAmount,
            gstRate: totalGstRate,
            gstAmount: totalGstAmount,
            grandTotal,
            stateOfSupply: sellState
        });

        // Update Inventory
        item.quantity -= quantitySold;
        item.lastUpdated = Date.now();

        await Promise.all([item.save(), newSale.save()]);

        // Automatically generate Bookkeeping Entry for inventory sale
        await upsertAutomatedBookkeepingEntry({
            userId: req.user.id,
            date: newSale.saleDate || new Date(),
            description: `Inventory Sale: ${item.itemName} (${quantitySold} units)`,
            category: "Inventory Sales",
            amount: grandTotal || subtotal,
            type: "income",
            referenceId: `inv_sale_${newSale._id}`
        });

        res.json({
            message: "Item sold successfully",
            item,
            sale: newSale
        });
    } catch (error) {
        console.error("Error selling item:", error);
        res.status(500).json({ message: "Error selling item", error });
    }
});

// ✅ GET route to fetch sales history
router.get("/sales", verifyToken, async (req, res) => {
    try {
        const sales = await Sale.find({ userId: req.user.id }).sort({ saleDate: -1 });
        res.json({ sales });
    } catch (error) {
        console.error("Error fetching sales:", error);
        res.status(500).json({ message: "Error fetching sales history" });
    }
});

// ✅ DELETE route
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await InventoryItem.findOneAndDelete({ _id: id, userId: req.user.id });

        if (!deletedItem) {
            return res.status(404).json({ message: "Item not found or unauthorized" });
        }

        // Remove associated automated bookkeeping entry if any
        await removeAutomatedBookkeepingEntry({
            userId: req.user.id,
            referenceId: `inv_add_${id}`
        });

        res.json({ message: "Item deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting item", error });
    }
});

// ✅ GET route to fetch all categories for the user
router.get("/categories", verifyToken, async (req, res) => {
    try {
        const customCategories = await Category.find({ userId: req.user.id, type: "inventory" });
        res.json({ categories: customCategories });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Error fetching categories" });
    }
});

// ✅ POST route to add a new category
router.post("/categories", verifyToken, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const newCategory = new Category({
            userId: req.user.id,
            name,
            type: "inventory"
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
        const deletedCategory = await Category.findOneAndDelete({ _id: id, userId: req.user.id, type: "inventory" });

        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found or unauthorized" });
        }

        res.json({ message: "Category deleted successfully", deletedCategory });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: "Error deleting category" });
    }
});

// ✅ POST route to reserve stock (reduce quantity for invoice)
router.post("/reserve/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        const item = await InventoryItem.findOne({ _id: id, userId: req.user.id });
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        if (item.quantity < quantity) {
            return res.status(400).json({ message: "Insufficient stock" });
        }

        item.quantity -= quantity;
        item.lastUpdated = Date.now();
        await item.save();

        res.json({
            message: "Stock reserved successfully",
            item,
            remainingStock: item.quantity
        });
    } catch (error) {
        console.error("Error reserving stock:", error);
        res.status(500).json({ message: "Error reserving stock", error });
    }
});

// ✅ POST route to restore stock (add quantity back when removing from invoice)
router.post("/restore/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        const item = await InventoryItem.findOne({ _id: id, userId: req.user.id });
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        item.quantity += quantity;
        item.lastUpdated = Date.now();
        await item.save();

        res.json({
            message: "Stock restored successfully",
            item,
            currentStock: item.quantity
        });
    } catch (error) {
        console.error("Error restoring stock:", error);
        res.status(500).json({ message: "Error restoring stock", error });
    }
});

export default router;