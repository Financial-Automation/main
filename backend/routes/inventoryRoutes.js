import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { performance } from "perf_hooks";
import Sale from "../models/Sale.js";
import Category from "../models/Category.js";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";
import { recordInventoryMetric, getInventoryInstrumentationReport, resetInventoryMetrics } from "../utils/inventoryInstrumentation.js";

const router = express.Router();

// ✅ Instrumentation control endpoints
router.get("/instrumentation-stats", (req, res) => {
    res.json(getInventoryInstrumentationReport());
});

router.post("/instrumentation-reset", (req, res) => {
    resetInventoryMetrics();
    res.json({ status: "reset" });
});

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
    minStockLevel: { type: Number, default: 5 },
    lastUpdated: { type: Date, default: Date.now },
});

inventorySchema.index({ userId: 1, lastUpdated: -1 });

const InventoryItem = mongoose.model("InventoryItem", inventorySchema);

// Middleware to verify token
const verifyToken = (req, res, next) => {
    if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user) return next();
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
        const { itemName, sku, quantity, price, category, gstRate, sgst, cgst, igst, stateOfSupply, minStockLevel } = req.body;

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
            stateOfSupply,
            minStockLevel: minStockLevel !== undefined ? Number(minStockLevel) : 5
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
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: "Invalid item data or data type", error: error.message });
        }
        res.status(500).json({ message: "Error adding item", error });
    }
});

// Process-local In-Flight Promise Map for Single-Flight Request Coalescing
// Note: Each PM2 worker maintains its own process-local map.
const inFlightInventoryPromises = new Map();

// Coalescing instrumentation counters per worker
let inventoryRequestsReceived = 0;
let inventoryCommandsStarted = 0;
let inventoryCommandsCompleted = 0;
let inventoryCoalescedRequests = 0;
let inventoryQueryFailures = 0;

export const resetInventoryCoalescingMetrics = () => {
    inventoryRequestsReceived = 0;
    inventoryCommandsStarted = 0;
    inventoryCommandsCompleted = 0;
    inventoryCoalescedRequests = 0;
    inventoryQueryFailures = 0;
    inFlightInventoryPromises.clear();
};

export const getInventoryCoalescingMetrics = () => ({
    requestsReceived: inventoryRequestsReceived,
    commandsStarted: inventoryCommandsStarted,
    commandsCompleted: inventoryCommandsCompleted,
    coalescedRequests: inventoryCoalescedRequests,
    queryFailures: inventoryQueryFailures,
    inFlightMapSize: inFlightInventoryPromises.size
});

// ✅ GET route to fetch low-stock inventory alerts and stock valuation summary
router.get("/low-stock", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const items = await InventoryItem.find({ userId })
            .select("_id itemName sku quantity price costPrice buyPrice category minStockLevel lastUpdated")
            .lean();

        const lowStockItems = items.filter(item => {
            const minLevel = item.minStockLevel !== undefined ? item.minStockLevel : 5;
            return (item.quantity || 0) <= minLevel;
        });

        const totalValuation = items.reduce((sum, item) => {
            const unitPrice = item.price || item.costPrice || item.buyPrice || 0;
            return sum + ((item.quantity || 0) * unitPrice);
        }, 0);

        res.json({
            totalItems: items.length,
            lowStockCount: lowStockItems.length,
            totalValuation,
            lowStockItems
        });
    } catch (error) {
        console.error("Error fetching low-stock items:", error);
        res.status(500).json({ message: "Error fetching low-stock inventory data" });
    }
});

// ✅ GET route to fetch all inventory items (User Specific)
router.get("/all", async (req, res) => {
    const t_inv_start = performance.now();
    const isPerfDebug = process.env.PERF_DEBUG === "true";
    const corrId = req._corrId || (isPerfDebug ? Math.random().toString(36).substring(2, 10) : null);
    const reqStartTime = req._reqStartTime || (isPerfDebug ? performance.now() : null);

    inventoryRequestsReceived++;

    const userIdStr = req.user.id || req.user._id?.toString();
    const queryKey = JSON.stringify(req.query || {});
    const cacheKey = `${userIdStr}:${queryKey}`;

    try {
        const t_mongo_start = performance.now();
        let items;
        let wasCoalesced = false;

        const isSingleFlightEnabled = process.env.ENABLE_INVENTORY_SINGLE_FLIGHT !== "false";

        if (isSingleFlightEnabled && inFlightInventoryPromises.has(cacheKey)) {
            inventoryCoalescedRequests++;
            wasCoalesced = true;
            items = await inFlightInventoryPromises.get(cacheKey);
        } else {
            const fetchPromise = (async () => {
                try {
                    inventoryCommandsStarted++;
                    const docs = await InventoryItem.find({ userId: req.user.id })
                        .select("_id itemName sku quantity price costPrice buyPrice category gstRate sgst cgst igst stateOfSupply lastUpdated")
                        .sort({ lastUpdated: -1 })
                        .lean();
                    inventoryCommandsCompleted++;
                    return docs;
                } catch (err) {
                    inventoryQueryFailures++;
                    throw err;
                } finally {
                    if (isSingleFlightEnabled) {
                        inFlightInventoryPromises.delete(cacheKey);
                    }
                }
            })();

            if (isSingleFlightEnabled) {
                inFlightInventoryPromises.set(cacheKey, fetchPromise);
            }
            items = await fetchPromise;
        }

        const t_mongo_end = performance.now();

        const t_ser_start = performance.now();
        const jsonString = JSON.stringify(items);
        const t_ser_end = performance.now();
        const payload_bytes = Buffer.byteLength(jsonString, "utf8");

        res.on("finish", () => {
            const t_write_end = performance.now();
            const t_arrival = req._t_arrival || t_inv_start;
            const t_auth_start = req._t_auth_start || t_inv_start;
            const t_auth_done = req._t_auth_done || t_inv_start;
            const t_sub_start = req._t_sub_start || t_auth_done;
            const t_sub_done = req._t_sub_done || t_sub_start;
            const t_module_start = req._t_module_start || t_sub_done;
            const t_module_done = req._t_module_done || t_module_start;

            recordInventoryMetric({
                req_to_auth: t_auth_start - t_arrival,
                jwt_verify: req._t_jwt_dur || 0,
                sub_module_middleware: (t_sub_done - t_sub_start) + (t_module_done - t_module_start),
                routing_dispatch: t_inv_start - t_module_done,
                pre_mongo_handler: t_mongo_start - t_inv_start,
                mongo_query_exec: t_mongo_end - t_mongo_start,
                post_mongo_wait: t_ser_start - t_mongo_end,
                serialization: t_ser_end - t_ser_start,
                write_response: t_write_end - t_ser_end,
                total_duration: t_write_end - t_arrival,
                payload_bytes,
                record_count: items.length,
                was_coalesced: wasCoalesced
            });
        });

        if (isPerfDebug) {
            const queryDuration = (t_mongo_end - t_mongo_start).toFixed(2);
            console.log(`[PERF_DEBUG] [${corrId}] inventory GET /all Mongo query duration: ${queryDuration} ms (coalesced: ${wasCoalesced})`);

            if (reqStartTime) {
                const totalDuration = (performance.now() - reqStartTime).toFixed(2);
                console.log(`[PERF_DEBUG] [${corrId}] total /api/inventory/all request duration: ${totalDuration} ms`);
            }
        }

        res.setHeader("Content-Type", "application/json");
        res.send(jsonString);
    } catch (error) {
        console.error("Error fetching inventory:", error);
        if (isPerfDebug && reqStartTime) {
            const totalDuration = (performance.now() - reqStartTime).toFixed(2);
            console.log(`[PERF_DEBUG] [${corrId}] total /api/inventory/all request duration: ${totalDuration} ms (error)`);
        }
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