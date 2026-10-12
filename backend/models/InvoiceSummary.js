import mongoose from "mongoose";

// Counter Schema for Auto-Increment ID
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", counterSchema);

// InvoiceSummary Schema
const invoiceSummarySchema = new mongoose.Schema({
    id: {
        type: Number,
        unique: true,
        default: 0
    },
    productName: {
        type: String,
        required: true,
        trim: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    },
    tax: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    createdbyid: {
        type: String,
        required: true,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-increment ID middleware
invoiceSummarySchema.pre('validate', async function (next) {
    if (this.isNew && (!this.id || this.id === 0)) {
        try {
            const counter = await Counter.findByIdAndUpdate(
                { _id: 'invoiceSummaryId' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );
            this.id = counter.seq;
            next();
        } catch (error) {
            next(error);
        }
    } else {
        next();
    }
});

// Update timestamp on save
invoiceSummarySchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const InvoiceSummary = mongoose.model("InvoiceSummary", invoiceSummarySchema);

export default InvoiceSummary;
export { Counter };
