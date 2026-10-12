import express from "express";
import InvoiceSummary from "../models/InvoiceSummary.js";

import jwt from "jsonwebtoken";

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

const router = express.Router();

// ✅ 1. Create New Invoice Summary
router.post("/create", verifyToken, async (req, res) => {
    try {
        const { productName, quantity, rate, tax } = req.body;
        const createdbyid = req.user.id; // Enforce user ID from authentication token

        // Validate required fields
        if (!productName || quantity === undefined || rate === undefined) {
            return res.status(400).json({
                message: "Missing required fields: productName, quantity, and rate are required"
            });
        }

        // Validate numeric fields
        if (quantity < 0 || rate < 0 || (tax !== undefined && tax < 0)) {
            return res.status(400).json({
                message: "Quantity, rate, and tax must be non-negative numbers"
            });
        }

        const newInvoiceSummary = new InvoiceSummary({
            productName,
            quantity,
            rate,
            tax: tax || 0,
            createdbyid
        });

        await newInvoiceSummary.save();

        res.status(201).json({
            message: "Invoice summary created successfully!",
            data: newInvoiceSummary
        });
    } catch (error) {
        console.error("Error creating invoice summary:", error);
        res.status(500).json({
            message: "Error creating invoice summary",
            error: error.message
        });
    }
});

// ✅ 2. Get All Invoice Summaries for Authenticated User
router.get("/all", verifyToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'id',
            sortOrder = 'desc'
        } = req.query;

        const query = { createdbyid: req.user.id };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const invoiceSummaries = await InvoiceSummary.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await InvoiceSummary.countDocuments(query);

        res.json({
            invoiceSummaries,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching invoice summaries:", error);
        res.status(500).json({
            message: "Error fetching invoice summaries",
            error: error.message
        });
    }
});

// ✅ 3. Get Single Invoice Summary by ID for Authenticated User
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const invoiceSummary = await InvoiceSummary.findOne({
            id: parseInt(req.params.id),
            createdbyid: req.user.id
        });

        if (!invoiceSummary) {
            return res.status(404).json({
                message: "Invoice summary not found or access denied"
            });
        }

        res.json(invoiceSummary);
    } catch (error) {
        console.error("Error fetching invoice summary:", error);
        res.status(500).json({
            message: "Error fetching invoice summary",
            error: error.message
        });
    }
});

// ✅ 4. Get Invoice Summaries by User ID (Ensuring they request their own data)
router.get("/user/:userId", verifyToken, async (req, res) => {
    try {
        if (req.params.userId !== req.user.id) {
            return res.status(403).json({ message: "Access denied. Cannot view another user's invoice summaries." });
        }

        const {
            page = 1,
            limit = 20
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const invoiceSummaries = await InvoiceSummary.find({
            createdbyid: req.user.id
        })
            .sort({ id: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await InvoiceSummary.countDocuments({
            createdbyid: req.user.id
        });

        res.json({
            invoiceSummaries,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching user invoice summaries:", error);
        res.status(500).json({
            message: "Error fetching user invoice summaries",
            error: error.message
        });
    }
});

// ✅ 5. Update Invoice Summary for Authenticated User
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { productName, quantity, rate, tax } = req.body;

        const updateData = {};
        if (productName !== undefined) updateData.productName = productName;
        if (quantity !== undefined) {
            if (quantity < 0) {
                return res.status(400).json({
                    message: "Quantity must be non-negative"
                });
            }
            updateData.quantity = quantity;
        }
        if (rate !== undefined) {
            if (rate < 0) {
                return res.status(400).json({
                    message: "Rate must be non-negative"
                });
            }
            updateData.rate = rate;
        }
        if (tax !== undefined) {
            if (tax < 0) {
                return res.status(400).json({
                    message: "Tax must be non-negative"
                });
            }
            updateData.tax = tax;
        }

        updateData.updatedAt = new Date();

        const updatedInvoiceSummary = await InvoiceSummary.findOneAndUpdate(
            { id: parseInt(req.params.id), createdbyid: req.user.id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedInvoiceSummary) {
            return res.status(404).json({
                message: "Invoice summary not found or access denied"
            });
        }

        res.json({
            message: "Invoice summary updated successfully!",
            data: updatedInvoiceSummary
        });
    } catch (error) {
        console.error("Error updating invoice summary:", error);
        res.status(500).json({
            message: "Error updating invoice summary",
            error: error.message
        });
    }
});

// ✅ 6. Delete Invoice Summary for Authenticated User
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const deletedInvoiceSummary = await InvoiceSummary.findOneAndDelete({
            id: parseInt(req.params.id),
            createdbyid: req.user.id
        });

        if (!deletedInvoiceSummary) {
            return res.status(404).json({
                message: "Invoice summary not found or access denied"
            });
        }

        res.json({
            message: "Invoice summary deleted successfully!",
            data: deletedInvoiceSummary
        });
    } catch (error) {
        console.error("Error deleting invoice summary:", error);
        res.status(500).json({
            message: "Error deleting invoice summary",
            error: error.message
        });
    }
});

// ✅ 7. Get Invoice Summary Statistics for Authenticated User
router.get("/stats/overview", verifyToken, async (req, res) => {
    try {
        const matchQuery = { createdbyid: req.user.id };

        const stats = await InvoiceSummary.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalRecords: { $sum: 1 },
                    totalQuantity: { $sum: "$quantity" },
                    totalValue: {
                        $sum: {
                            $multiply: ["$quantity", "$rate"]
                        }
                    },
                    totalTax: { $sum: "$tax" },
                    avgRate: { $avg: "$rate" },
                    avgQuantity: { $avg: "$quantity" }
                }
            }
        ]);

        res.json(stats[0] || {
            totalRecords: 0,
            totalQuantity: 0,
            totalValue: 0,
            totalTax: 0,
            avgRate: 0,
            avgQuantity: 0
        });
    } catch (error) {
        console.error("Error fetching invoice summary statistics:", error);
        res.status(500).json({
            message: "Error fetching invoice summary statistics",
            error: error.message
        });
    }
});

// ✅ 8. Search Invoice Summaries by Product Name for Authenticated User
router.get("/search/:productName", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {
            productName: { $regex: req.params.productName, $options: 'i' },
            createdbyid: req.user.id
        };

        const invoiceSummaries = await InvoiceSummary.find(query)
            .sort({ id: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await InvoiceSummary.countDocuments(query);

        res.json({
            invoiceSummaries,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error searching invoice summaries:", error);
        res.status(500).json({
            message: "Error searching invoice summaries",
            error: error.message
        });
    }
});

export default router;
