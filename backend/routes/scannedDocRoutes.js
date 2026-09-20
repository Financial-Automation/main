import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const router = express.Router();

// Scanned Document Schema - stores PDF as base64 in MongoDB
const scannedDocSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    fileName: { type: String, required: true },
    fileData: { type: String, required: true }, // base64 PDF data
    mimeType: { type: String, default: "application/pdf" },
    fileSize: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

const ScannedDoc = mongoose.model("ScannedDoc", scannedDocSchema);

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

// POST - Save scanned document
router.post("/save", verifyToken, async (req, res) => {
    try {
        const { fileData, fileName, mimeType } = req.body;

        if (!fileData) {
            return res.status(400).json({ message: "No file data provided" });
        }

        // Calculate approximate size (base64 is ~33% larger than binary)
        const fileSize = Math.round((fileData.length * 3) / 4);

        const doc = new ScannedDoc({
            userId: req.user.id,
            fileName: fileName || `scan_${Date.now()}.pdf`,
            fileData,
            mimeType: mimeType || "application/pdf",
            fileSize,
        });

        await doc.save();

        res.status(201).json({
            message: "Document saved!",
            docId: doc._id,
            fileName: doc.fileName,
        });
    } catch (error) {
        console.error("Error saving scanned document:", error);
        res.status(500).json({ message: "Error saving document", error: error.message });
    }
});

// GET - Serve document file by ID (public - for WhatsApp sharing)
router.get("/file/:id", async (req, res) => {
    try {
        const doc = await ScannedDoc.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ message: "Document not found" });
        }

        // Convert base64 to buffer and serve as PDF
        const buffer = Buffer.from(doc.fileData, "base64");
        res.set({
            "Content-Type": doc.mimeType,
            "Content-Disposition": `inline; filename="${doc.fileName}"`,
            "Content-Length": buffer.length,
        });
        res.send(buffer);
    } catch (error) {
        console.error("Error serving document:", error);
        res.status(500).json({ message: "Error serving document" });
    }
});

// GET - List user's scanned documents
router.get("/all", verifyToken, async (req, res) => {
    try {
        const docs = await ScannedDoc.find({ userId: req.user.id })
            .select("-fileData") // Don't send file data in list
            .sort({ createdAt: -1 });
        res.json({ documents: docs });
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ message: "Error fetching documents" });
    }
});

// DELETE - Delete document
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const deleted = await ScannedDoc.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });
        if (!deleted) {
            return res.status(404).json({ message: "Document not found" });
        }
        res.json({ message: "Document deleted" });
    } catch (error) {
        console.error("Error deleting document:", error);
        res.status(500).json({ message: "Error deleting document" });
    }
});

export default router;
