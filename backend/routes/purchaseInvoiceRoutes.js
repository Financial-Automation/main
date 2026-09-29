import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { checkPlanLimit } from "../utils/authMiddleware.js";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";
import User from "../models/User.js";

const router = express.Router();

// Purchase Invoice Schema
const purchaseInvoiceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    customerType: { type: String, enum: ["B2B", "B2C"], default: "B2C" },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    customerGstin: { type: String, default: "" },
    supplierName: { type: String, required: true },
    phone: { type: String, default: "" },
    gstin: { type: String, default: "" },
    billNo: { type: String, required: true },
    billDate: { type: String, required: true },
    paymentMethod: { type: String, enum: ["Cash", "Credit", "G Pay", "Net Banking"], default: "Cash" },
    invoiceSize: { type: String, enum: ["A4", "A5"], default: "A4" },
    invoiceFormat: { type: String, enum: ["Supermarket", "Hotel", "Stationery Shop"], default: "Supermarket" },
    stateOfSupply: { type: String, required: true },
    businessState: { type: String, default: "Tamil Nadu" },
    items: [{
        itemName: { type: String, required: true },
        itemCode: { type: String, default: "" },
        codeType: { type: String, enum: ["HSN", "SAC"], default: "HSN" },
        hsnCode: { type: String, default: "" },
        quantity: { type: Number, required: true },
        unit: { type: String, default: "Pcs" },
        pricePerUnit: { type: Number, required: true },
        priceWithTax: { type: Boolean, default: false },
        discountPercent: { type: Number, default: 0 },
        discountAmount: { type: Number, default: 0 },
        taxPercent: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        sgstRate: { type: Number, default: 0 },
        sgstAmount: { type: Number, default: 0 },
        cgstRate: { type: Number, default: 0 },
        cgstAmount: { type: Number, default: 0 },
        igstRate: { type: Number, default: 0 },
        igstAmount: { type: Number, default: 0 },
        isInterState: { type: Boolean, default: false },
        amount: { type: Number, required: true },
    }],
    subtotal: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    bankName: { type: String, default: "" },
    accountType: { type: String, default: "Current" },
    accountNumber: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    authorisedSignature: { type: String, default: "" },
    templateId: { type: String, default: "" },
    templateSnapshot: { type: Object, default: null },
    status: { type: String, enum: ["draft", "completed", "paid", "cancelled"], default: "completed" },
    createdAt: { type: Date, default: Date.now },
});

const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", purchaseInvoiceSchema);

// Get the InventoryItem model (already registered by inventoryRoutes)
const getInventoryModel = () => mongoose.model("InventoryItem");

// Helper to enrich purchase invoice with default bank details from user if missing
const enrichInvoiceWithBankDetails = async (invoice) => {
    if (!invoice) return invoice;
    const invObj = typeof invoice.toObject === "function" ? invoice.toObject() : { ...invoice };
    
    // Check if bank details are missing
    if (!invObj.bankName || !invObj.accountNumber || !invObj.ifscCode) {
        try {
            const user = invObj.userId ? await User.findById(invObj.userId) : null;
            if (user) {
                invObj.bankName = invObj.bankName || user.bankName || "ABC Bank";
                invObj.accountType = invObj.accountType || user.accountType || "Current";
                invObj.accountNumber = invObj.accountNumber || user.accountNumber || "123456789012";
                invObj.ifscCode = invObj.ifscCode || user.ifscCode || "ABCD0001234";
                invObj.authorisedSignature = invObj.authorisedSignature || user.authorisedSignature || "Store Manager";
            }
        } catch (e) {
            console.error("Error enriching bank details:", e);
        }
    }
    
    // Ensure default bank info if still blank
    if (!invObj.bankName) invObj.bankName = "ABC Bank";
    if (!invObj.accountType) invObj.accountType = "Current";
    if (!invObj.accountNumber) invObj.accountNumber = "123456789012";
    if (!invObj.ifscCode) invObj.ifscCode = "ABCD0001234";
    
    return invObj;
};

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

// GET - Public (no auth) purchase invoice by ID
router.get("/public/:id", async (req, res) => {
    try {
        const invoice = await PurchaseInvoice.findById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ message: "Purchase invoice not found" });
        }
        const enriched = await enrichInvoiceWithBankDetails(invoice);
        res.json(enriched);
    } catch (error) {
        console.error("Error fetching public purchase invoice:", error);
        res.status(500).json({ message: "Error fetching purchase invoice" });
    }
});

// POST - Create purchase invoice & add items to inventory stock
router.post("/create", verifyToken, async (req, res) => {
    try {
        const limitCheck = await checkPlanLimit(req.user.id, req.user.role, "purchase-invoice");
        if (!limitCheck.allowed) {
            return res.status(403).json(limitCheck);
        }
        const invoiceData = req.body;
        
        // Auto-fetch default bank details if missing
        const user = await User.findById(req.user.id);
        if (user) {
            if (!invoiceData.bankName) invoiceData.bankName = user.bankName || "ABC Bank";
            if (!invoiceData.accountType) invoiceData.accountType = user.accountType || "Current";
            if (!invoiceData.accountNumber) invoiceData.accountNumber = user.accountNumber || "123456789012";
            if (!invoiceData.ifscCode) invoiceData.ifscCode = user.ifscCode || "ABCD0001234";
            if (!invoiceData.authorisedSignature) invoiceData.authorisedSignature = user.authorisedSignature || "Store Manager";
        }

        const newInvoice = new PurchaseInvoice({
            userId: req.user.id,
            ...invoiceData,
        });
        await newInvoice.save();

        // Automatically generate Bookkeeping Entry for purchase invoice if not draft
        if (newInvoice.status !== 'draft') {
            await upsertAutomatedBookkeepingEntry({
                userId: req.user.id,
                date: newInvoice.billDate ? new Date(newInvoice.billDate) : new Date(),
                description: `Purchase Invoice ${newInvoice.billNo} from ${newInvoice.supplierName}`,
                category: "Purchases",
                amount: newInvoice.total || newInvoice.subtotal,
                type: "expense",
                referenceId: `purchase_inv_${newInvoice._id}`
            });
        }

        // Add purchased items to inventory stock if not draft
        const stockResults = [];
        if (newInvoice.status !== 'draft') {
            const InventoryItem = getInventoryModel();

            for (const item of invoiceData.items) {
                const rawSku = item.itemCode ? item.itemCode.trim() : "";
                const rawName = item.itemName ? item.itemName.trim() : "";
                const sku = rawSku || `PUR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

                // Check if item with same SKU or Name already exists for this user to avoid duplicates
                const searchOr = [];
                if (rawSku) searchOr.push({ sku: rawSku });
                if (rawName) searchOr.push({ itemName: new RegExp(`^${rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });

                const existingItem = searchOr.length > 0 ? await InventoryItem.findOne({
                    userId: req.user.id,
                    $or: searchOr,
                }) : null;

                if (existingItem) {
                    // Update quantity and product master info of existing item
                    existingItem.quantity += item.quantity;
                    existingItem.price = item.pricePerUnit;
                    if (item.hsnCode) existingItem.hsnCode = item.hsnCode;
                    if (item.taxPercent !== undefined) existingItem.gstRate = item.taxPercent;
                    if (item.unit) existingItem.unit = item.unit;
                    existingItem.lastUpdated = Date.now();
                    await existingItem.save();
                    stockResults.push({ itemName: item.itemName, action: "updated", quantity: existingItem.quantity });
                } else {
                    // Create new inventory item
                    const newStockItem = new InventoryItem({
                        userId: req.user.id,
                        itemName: item.itemName,
                        sku: sku,
                        hsnCode: item.hsnCode || "",
                        quantity: item.quantity,
                        unit: item.unit || "Pcs",
                        price: item.pricePerUnit,
                        category: "General",
                        gstRate: item.taxPercent || 0,
                        sgst: item.isInterState ? 0 : (item.taxPercent || 0) / 2,
                        cgst: item.isInterState ? 0 : (item.taxPercent || 0) / 2,
                        igst: item.isInterState ? (item.taxPercent || 0) : 0,
                        stateOfSupply: invoiceData.stateOfSupply || "",
                    });
                    await newStockItem.save();
                    stockResults.push({ itemName: item.itemName, action: "created", quantity: item.quantity });
                }
            }
        }

        res.status(201).json({
            message: newInvoice.status === 'draft' ? "Purchase invoice drafted!" : "Purchase invoice saved & items added to stock!",
            invoice: newInvoice,
            stockUpdates: stockResults,
        });
    } catch (error) {
        console.error("Error creating purchase invoice:", error);
        res.status(500).json({ message: "Error saving purchase invoice", error: error.message });
    }
});

// PUT - Update purchase invoice & add items to inventory stock if completed
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const invoiceData = req.body;
        const existingInvoice = await PurchaseInvoice.findOne({ _id: req.params.id, userId: req.user.id });
        if (!existingInvoice) {
            return res.status(404).json({ message: "Purchase invoice not found" });
        }

        // We only add to stock if it transitioned from draft to completed
        const wasDraft = existingInvoice.status === "draft" || existingInvoice.status === undefined;
        const isNowCompleted = invoiceData.status !== "draft";
        
        Object.assign(existingInvoice, invoiceData);
        await existingInvoice.save();

        const stockResults = [];
        if (wasDraft && isNowCompleted) {
            const InventoryItem = getInventoryModel();
            for (const item of invoiceData.items) {
                const rawSku = item.itemCode ? item.itemCode.trim() : "";
                const rawName = item.itemName ? item.itemName.trim() : "";
                const sku = rawSku || `PUR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

                const searchOr = [];
                if (rawSku) searchOr.push({ sku: rawSku });
                if (rawName) searchOr.push({ itemName: new RegExp(`^${rawName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "i") });

                const existingItem = searchOr.length > 0 ? await InventoryItem.findOne({
                    userId: req.user.id,
                    $or: searchOr,
                }) : null;

                if (existingItem) {
                    existingItem.quantity += item.quantity;
                    existingItem.price = item.pricePerUnit;
                    if (item.hsnCode) existingItem.hsnCode = item.hsnCode;
                    if (item.taxPercent !== undefined) existingItem.gstRate = item.taxPercent;
                    if (item.unit) existingItem.unit = item.unit;
                    existingItem.lastUpdated = Date.now();
                    await existingItem.save();
                    stockResults.push({ itemName: item.itemName, action: "updated", quantity: existingItem.quantity });
                } else {
                    const newStockItem = new InventoryItem({
                        userId: req.user.id,
                        itemName: item.itemName,
                        sku: sku,
                        hsnCode: item.hsnCode || "",
                        quantity: item.quantity,
                        unit: item.unit || "Pcs",
                        price: item.pricePerUnit,
                        category: "General",
                        gstRate: item.taxPercent || 0,
                        sgst: item.isInterState ? 0 : (item.taxPercent || 0) / 2,
                        cgst: item.isInterState ? 0 : (item.taxPercent || 0) / 2,
                        igst: item.isInterState ? (item.taxPercent || 0) : 0,
                        stateOfSupply: invoiceData.stateOfSupply || "",
                    });
                    await newStockItem.save();
                    stockResults.push({ itemName: item.itemName, action: "created", quantity: item.quantity });
                }
            }
            
            // Upsert Bookkeeping Entry since it is now completed
            await upsertAutomatedBookkeepingEntry({
                userId: req.user.id,
                date: existingInvoice.billDate ? new Date(existingInvoice.billDate) : new Date(),
                description: `Purchase Invoice ${existingInvoice.billNo} from ${existingInvoice.supplierName}`,
                category: "Purchases",
                amount: existingInvoice.total || existingInvoice.subtotal,
                type: "expense",
                referenceId: `purchase_inv_${existingInvoice._id}`
            });
        }

        res.json({
            message: existingInvoice.status === "draft" ? "Purchase invoice draft updated!" : "Purchase invoice updated & items added to stock!",
            invoice: existingInvoice,
            stockUpdates: stockResults,
        });
    } catch (error) {
        console.error("Error updating purchase invoice:", error);
        res.status(500).json({ message: "Error updating purchase invoice", error: error.message });
    }
});

// GET - All purchase invoices for authenticated user
router.get("/all", verifyToken, async (req, res) => {
    try {
        const invoices = await PurchaseInvoice.find({ userId: req.user.id }).sort({ createdAt: -1 });
        const user = await User.findById(req.user.id);
        const enrichedInvoices = invoices.map(inv => {
            const obj = inv.toObject();
            if (user) {
                if (!obj.bankName) obj.bankName = user.bankName || "ABC Bank";
                if (!obj.accountType) obj.accountType = user.accountType || "Current";
                if (!obj.accountNumber) obj.accountNumber = user.accountNumber || "123456789012";
                if (!obj.ifscCode) obj.ifscCode = user.ifscCode || "ABCD0001234";
                if (!obj.authorisedSignature) obj.authorisedSignature = user.authorisedSignature || "Store Manager";
            }
            if (!obj.bankName) obj.bankName = "ABC Bank";
            if (!obj.accountType) obj.accountType = "Current";
            if (!obj.accountNumber) obj.accountNumber = "123456789012";
            if (!obj.ifscCode) obj.ifscCode = "ABCD0001234";
            return obj;
        });
        res.json({ invoices: enrichedInvoices });
    } catch (error) {
        console.error("Error fetching purchase invoices:", error);
        res.status(500).json({ message: "Error fetching purchase invoices" });
    }
});

// GET - Single purchase invoice by ID
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, userId: req.user.id });
        if (!invoice) {
            return res.status(404).json({ message: "Purchase invoice not found" });
        }
        const enriched = await enrichInvoiceWithBankDetails(invoice);
        res.json(enriched);
    } catch (error) {
        console.error("Error fetching purchase invoice:", error);
        res.status(500).json({ message: "Error fetching purchase invoice" });
    }
});


// POST - Record payment for purchase invoice
router.post("/:id/payment", verifyToken, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid payment amount" });
        }
        
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, userId: req.user.id });
        if (!invoice) {
            return res.status(404).json({ message: "Purchase invoice not found" });
        }
        
        // Update paid and balance
        invoice.paid = (invoice.paid || 0) + Number(amount);
        invoice.balance = invoice.total - invoice.paid;
        
        // Don't allow negative balance
        if (invoice.balance < 0) {
            invoice.balance = 0;
            invoice.paid = invoice.total;
        }
        
        await invoice.save();
        
        res.json({ message: "Payment recorded successfully", invoice });
    } catch (error) {
        console.error("Error recording payment:", error);
        res.status(500).json({ message: "Error recording payment" });
    }
});

// DELETE - Delete purchase invoice

router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const deleted = await PurchaseInvoice.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deleted) {
            return res.status(404).json({ message: "Purchase invoice not found" });
        }

        // Remove automated Bookkeeping Entry
        await removeAutomatedBookkeepingEntry({
            userId: req.user.id,
            referenceId: `purchase_inv_${req.params.id}`
        });

        res.json({ message: "Purchase invoice deleted" });
    } catch (error) {
        console.error("Error deleting purchase invoice:", error);
        res.status(500).json({ message: "Error deleting purchase invoice" });
    }
});

export default router;
