import express from "express";
import Customer from "../models/Customer.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
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
    const { name, email, phone, billingAddress, shippingAddress, gstin, placeOfSupply, paymentTerms } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    const newCustomer = new Customer({
      userId: req.user.id,
      name,
      email: email || "",
      phone: phone || "",
      billingAddress: billingAddress || "",
      shippingAddress: shippingAddress || "",
      gstin: gstin || "",
      placeOfSupply: placeOfSupply || "",
      paymentTerms: paymentTerms || "Due on Receipt"
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

// 2. Get All Customers
router.get("/", verifyToken, async (req, res) => {
  try {
    const customers = await Customer.find({ userId: req.user.id }).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ message: "Failed to fetch customers", error: error.message });
  }
});

// 3. Get Single Customer
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ message: "Failed to fetch customer", error: error.message });
  }
});

// 4. Update Customer
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updateData = req.body;
    updateData.updatedAt = new Date();

    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
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

// 5. Delete Customer
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deletedCustomer = await Customer.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!deletedCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({
      message: "Customer deleted successfully!",
      customer: deletedCustomer
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ message: "Failed to delete customer", error: error.message });
  }
});

export default router;
