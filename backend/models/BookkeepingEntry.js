import mongoose from "mongoose";

const bookkeepingEntrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    type: {
        type: String,
        enum: ["income", "expense"],
        required: true,
    },
    referenceId: {
        type: String,
        default: null,
    },
    isAutomated: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// ✅ Phase 31 Indexes (DEF-BK-03) — Eliminate COLLSCAN on user-scoped bookkeeping queries
bookkeepingEntrySchema.index({ userId: 1, date: -1 });
bookkeepingEntrySchema.index({ userId: 1, type: 1, date: -1 });
bookkeepingEntrySchema.index({ userId: 1, category: 1 });
bookkeepingEntrySchema.index({ userId: 1, referenceId: 1 }, { partialFilterExpression: { referenceId: { $type: "string" } }, unique: true });
bookkeepingEntrySchema.index({ userId: 1, type: 1 });
bookkeepingEntrySchema.index({ userId: 1, isAutomated: 1 });

const BookkeepingEntry = mongoose.model("BookkeepingEntry", bookkeepingEntrySchema);

export default BookkeepingEntry;
