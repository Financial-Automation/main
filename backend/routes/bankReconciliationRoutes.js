import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import csvParser from "csv-parser";
import xlsx from "xlsx";
import fs from "fs";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ✅ Reconciliation Session Schema
const reconciliationSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    ledgerFileName: String,
    bankStatementFileName: String,
    ledgerData: [{ type: Object }],
    bankData: [{ type: Object }],
    uploadedAt: { type: Date, default: Date.now },
    matchingOptions: {
        dateToleranceDays: { type: Number, default: 1 },
        amountTolerance: { type: Number, default: 0.01 },
        descriptionThreshold: { type: Number, default: 0.7 },
        useTime: { type: Boolean, default: false }
    },
    results: {
        totalLedgerTransactions: Number,
        totalBankTransactions: Number,
        matchedCount: Number,
        unmatchedLedgerCount: Number,
        unmatchedBankCount: Number,
        matchedTransactions: [{ type: Object }],
        unmatchedLedger: [{ type: Object }],
        unmatchedBank: [{ type: Object }]
    },
    status: {
        type: String,
        enum: ['uploaded', 'processing', 'completed', 'failed'],
        default: 'uploaded'
    },
    manualMatches: [{ type: Object }]
});

const ReconciliationSession = mongoose.model("ReconciliationSession", reconciliationSessionSchema);

// ✅ Helper function to process uploaded file
const processUploadedFile = async (filePath, fileType) => {
    try {
        let data = [];

        if (fileType === 'csv') {
            return new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csvParser())
                    .on('data', (row) => data.push(row))
                    .on('end', () => {
                        fs.unlinkSync(filePath);
                        resolve(data);
                    })
                    .on('error', reject);
            });
        } else if (fileType === 'xlsx' || fileType === 'xls') {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            fs.unlinkSync(filePath);
            return data;
        }

        throw new Error('Unsupported file type. Only CSV and Excel files are supported.');
    } catch (error) {
        throw error;
    }
};

// ✅ Levenshtein distance for string similarity
const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 || len2 === 0) return 0;

    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
};

// ✅ Parse time string to minutes
const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
};

// ✅ Calculate match score (0-100)
const calculateMatchScore = (ledgerTx, bankTx, options) => {
    let score = 0;

    // Define weights based on whether time matching is enabled
    let weights;
    if (options.useTime) {
        weights = {
            date: 30,
            time: 10,
            amount: 40,
            description: 20
        };
    } else {
        weights = {
            date: 35,
            time: 0,
            amount: 45,
            description: 20
        };
    }

    // Date matching
    const ledgerDate = new Date(ledgerTx.date || ledgerTx.Date);
    const bankDate = new Date(bankTx.date || bankTx.Date);
    const dateDiff = Math.abs(ledgerDate - bankDate) / (1000 * 60 * 60 * 24);

    if (dateDiff === 0) {
        score += weights.date;
    } else if (dateDiff <= options.dateToleranceDays) {
        score += weights.date * (1 - dateDiff / options.dateToleranceDays);
    }

    // Time matching (if enabled)
    if (options.useTime) {
        const ledgerTime = ledgerTx.time || ledgerTx.Time;
        const bankTime = bankTx.time || bankTx.Time;

        if (ledgerTime && bankTime) {
            const timeDiff = Math.abs(parseTime(ledgerTime) - parseTime(bankTime));
            if (timeDiff <= 60) { // Within 1 hour
                score += weights.time * (1 - timeDiff / 60);
            }
        }
    }

    // Amount matching
    const ledgerAmount = parseFloat(ledgerTx.amount || ledgerTx.Amount || 0);
    const bankAmount = parseFloat(bankTx.amount || bankTx.Amount || 0);
    const amountDiff = Math.abs(ledgerAmount - bankAmount);

    if (amountDiff <= options.amountTolerance) {
        score += weights.amount;
    } else if (ledgerAmount > 0 && amountDiff / ledgerAmount < 0.01) { // 1% tolerance
        score += weights.amount * 0.5;
    }

    // Description matching (fuzzy)
    const ledgerDesc = ledgerTx.description || ledgerTx.Description || '';
    const bankDesc = bankTx.description || bankTx.Description || '';
    const descSimilarity = calculateSimilarity(ledgerDesc, bankDesc);
    score += weights.description * descSimilarity;

    return Math.round(score);
};

// ✅ Get match type based on score
const getMatchType = (score) => {
    if (score >= 95) return 'exact';
    if (score >= 80) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
};

// ✅ Find differences between transactions
const findDifferences = (ledgerTx, bankTx) => {
    const differences = [];

    const ledgerAmount = parseFloat(ledgerTx.amount || ledgerTx.Amount || 0);
    const bankAmount = parseFloat(bankTx.amount || bankTx.Amount || 0);

    if (Math.abs(ledgerAmount - bankAmount) > 0.01) {
        differences.push(`Amount: ₹${ledgerAmount} vs ₹${bankAmount}`);
    }

    const ledgerDate = new Date(ledgerTx.date || ledgerTx.Date);
    const bankDate = new Date(bankTx.date || bankTx.Date);

    if (ledgerDate.toDateString() !== bankDate.toDateString()) {
        differences.push(`Date: ${ledgerDate.toLocaleDateString()} vs ${bankDate.toLocaleDateString()}`);
    }

    const ledgerDesc = (ledgerTx.description || ledgerTx.Description || '').toLowerCase();
    const bankDesc = (bankTx.description || bankTx.Description || '').toLowerCase();

    if (ledgerDesc !== bankDesc) {
        differences.push(`Description differs`);
    }

    return differences;
};

// ✅ Main matching algorithm
const matchTransactions = (ledgerData, bankData, options = {}) => {
    const matched = [];
    const unmatchedLedger = [];
    const unmatchedBank = [];
    const usedBankIndices = new Set();

    ledgerData.forEach((ledgerTx) => {
        let bestMatch = null;
        let bestScore = 0;

        bankData.forEach((bankTx, bankIndex) => {
            if (usedBankIndices.has(bankIndex)) return;

            const score = calculateMatchScore(ledgerTx, bankTx, options);

            if (score > bestScore && score >= 50) { // Minimum 50% confidence
                bestScore = score;
                bestMatch = { bankTx, bankIndex, score };
            }
        });

        if (bestMatch) {
            usedBankIndices.add(bestMatch.bankIndex);
            matched.push({
                ledgerTransaction: ledgerTx,
                bankTransaction: bestMatch.bankTx,
                matchScore: bestMatch.score,
                matchType: getMatchType(bestMatch.score),
                differences: findDifferences(ledgerTx, bestMatch.bankTx)
            });
        } else {
            unmatchedLedger.push(ledgerTx);
        }
    });

    // Remaining bank transactions are unmatched
    bankData.forEach((bankTx, index) => {
        if (!usedBankIndices.has(index)) {
            unmatchedBank.push(bankTx);
        }
    });

    return { matched, unmatchedLedger, unmatchedBank };
};

// ✅ 1. Create new reconciliation session
router.post("/create-session", async (req, res) => {
    try {
        const sessionId = `REC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = new ReconciliationSession({
            sessionId,
            userId: req.user.id,
            status: 'uploaded'
        });
        await session.save();

        res.status(201).json({
            message: "Session created",
            sessionId
        });
    } catch (error) {
        console.error("Error creating session:", error);
        res.status(500).json({ message: "Error creating session", error: error.message });
    }
});

// ✅ 2. Upload ledger data
router.post("/upload-ledger", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const { sessionId } = req.body;
        const filePath = req.file.path;
        const fileType = req.file.originalname.split('.').pop().toLowerCase();

        const ledgerData = await processUploadedFile(filePath, fileType);

        const updatedSession = await ReconciliationSession.findOneAndUpdate(
            { sessionId, userId: req.user.id },
            {
                ledgerData,
                ledgerFileName: req.file.originalname,
                'results.totalLedgerTransactions': ledgerData.length
            },
            { new: true }
        );

        if (!updatedSession) {
            return res.status(404).json({ message: "Reconciliation session not found or access denied." });
        }

        res.status(200).json({
            message: "Ledger uploaded successfully",
            transactionCount: ledgerData.length,
            preview: ledgerData.slice(0, 5)
        });
    } catch (error) {
        console.error("Error uploading ledger:", error);
        res.status(500).json({ message: "Error uploading ledger", error: error.message });
    }
});

// ✅ 3. Upload bank statement
router.post("/upload-bank-statement", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const { sessionId } = req.body;
        const filePath = req.file.path;
        const fileType = req.file.originalname.split('.').pop().toLowerCase();

        const bankData = await processUploadedFile(filePath, fileType);

        const updatedSession = await ReconciliationSession.findOneAndUpdate(
            { sessionId, userId: req.user.id },
            {
                bankData,
                bankStatementFileName: req.file.originalname,
                'results.totalBankTransactions': bankData.length
            },
            { new: true }
        );

        if (!updatedSession) {
            return res.status(404).json({ message: "Reconciliation session not found or access denied." });
        }

        res.status(200).json({
            message: "Bank statement uploaded successfully",
            transactionCount: bankData.length,
            preview: bankData.slice(0, 5)
        });
    } catch (error) {
        console.error("Error uploading bank statement:", error);
        res.status(500).json({ message: "Error uploading bank statement", error: error.message });
    }
});

// ✅ 4. Run matching algorithm
router.post("/match", async (req, res) => {
    try {
        const { sessionId, options } = req.body;

        const session = await ReconciliationSession.findOne({ sessionId, userId: req.user.id });
        if (!session) {
            return res.status(404).json({ message: "Session not found or access denied" });
        }

        if (!session.ledgerData || !session.bankData) {
            return res.status(400).json({ message: "Both ledger and bank statement must be uploaded" });
        }

        session.status = 'processing';
        session.matchingOptions = options || session.matchingOptions;
        await session.save();

        const { matched, unmatchedLedger, unmatchedBank } = matchTransactions(
            session.ledgerData,
            session.bankData,
            session.matchingOptions
        );

        session.results = {
            totalLedgerTransactions: session.ledgerData.length,
            totalBankTransactions: session.bankData.length,
            matchedCount: matched.length,
            unmatchedLedgerCount: unmatchedLedger.length,
            unmatchedBankCount: unmatchedBank.length,
            matchedTransactions: matched,
            unmatchedLedger,
            unmatchedBank
        };
        session.status = 'completed';
        await session.save();

        res.status(200).json({
            message: "Matching completed successfully",
            results: {
                summary: {
                    totalLedger: session.ledgerData.length,
                    totalBank: session.bankData.length,
                    matchedCount: matched.length,
                    unmatchedLedgerCount: unmatchedLedger.length,
                    unmatchedBankCount: unmatchedBank.length,
                    matchRate: ((matched.length / session.ledgerData.length) * 100).toFixed(2) + '%'
                },
                matched: matched.slice(0, 50),
                unmatchedLedger: unmatchedLedger.slice(0, 50),
                unmatchedBank: unmatchedBank.slice(0, 50)
            }
        });
    } catch (error) {
        console.error("Error running match:", error);
        res.status(500).json({ message: "Error running match", error: error.message });
    }
});

// ✅ 5. Get reconciliation results
router.get("/results/:sessionId", async (req, res) => {
    try {
        const session = await ReconciliationSession.findOne({ sessionId: req.params.sessionId, userId: req.user.id });

        if (!session) {
            return res.status(404).json({ message: "Session not found or access denied" });
        }

        res.json({
            sessionId: session.sessionId,
            status: session.status,
            results: session.results,
            matchingOptions: session.matchingOptions
        });
    } catch (error) {
        console.error("Error fetching results:", error);
        res.status(500).json({ message: "Error fetching results" });
    }
});

// ✅ 6. Manual match
router.put("/manual-match", async (req, res) => {
    try {
        const { sessionId, ledgerTransaction, bankTransaction, note } = req.body;

        const session = await ReconciliationSession.findOne({ sessionId, userId: req.user.id });
        if (!session) {
            return res.status(404).json({ message: "Session not found or access denied" });
        }

        const manualMatch = {
            ledgerTransaction,
            bankTransaction,
            matchScore: 100,
            matchType: 'manual',
            note,
            matchedAt: new Date()
        };

        session.manualMatches.push(manualMatch);
        await session.save();

        res.json({ message: "Manual match added successfully", match: manualMatch });
    } catch (error) {
        console.error("Error adding manual match:", error);
        res.status(500).json({ message: "Error adding manual match" });
    }
});

// ✅ 7. Export reconciliation report
router.get("/export/:sessionId", async (req, res) => {
    try {
        const { format = 'csv' } = req.query;
        const session = await ReconciliationSession.findOne({ sessionId: req.params.sessionId, userId: req.user.id });

        if (!session) {
            return res.status(404).json({ message: "Session not found or access denied" });
        }

        if (format === 'csv') {
            let csvContent = "Type,Ledger Date,Ledger Amount,Ledger Description,Bank Date,Bank Amount,Bank Description,Match Score,Match Type,Differences\n";

            session.results.matchedTransactions.forEach(match => {
                const ledger = match.ledgerTransaction;
                const bank = match.bankTransaction;
                csvContent += `"Matched","${ledger.date || ledger.Date}","${ledger.amount || ledger.Amount}","${ledger.description || ledger.Description}","${bank.date || bank.Date}","${bank.amount || bank.Amount}","${bank.description || bank.Description}","${match.matchScore}","${match.matchType}","${match.differences.join('; ')}"\n`;
            });

            session.results.unmatchedLedger.forEach(tx => {
                csvContent += `"Unmatched Ledger","${tx.date || tx.Date}","${tx.amount || tx.Amount}","${tx.description || tx.Description}","","","","","",""\n`;
            });

            session.results.unmatchedBank.forEach(tx => {
                csvContent += `"Unmatched Bank","","","","${tx.date || tx.Date}","${tx.amount || tx.Amount}","${tx.description || tx.Description}","","",""\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=reconciliation_${session.sessionId}.csv`);
            res.send(csvContent);
        } else {
            res.status(400).json({ message: "Unsupported export format" });
        }
    } catch (error) {
        console.error("Error exporting data:", error);
        res.status(500).json({ message: "Error exporting data" });
    }
});

// ✅ 8. Combined reconciliation endpoint (upload both files at once)
router.post("/reconcile", upload.fields([
    { name: 'ledgerFile', maxCount: 1 },
    { name: 'bankFile', maxCount: 1 }
]), async (req, res) => {
    try {
        // Validate files
        if (!req.files || !req.files.ledgerFile || !req.files.bankFile) {
            return res.status(400).json({ message: "Both ledger and bank statement files are required" });
        }

        const ledgerFile = req.files.ledgerFile[0];
        const bankFile = req.files.bankFile[0];

        // Get file types
        const ledgerFileType = ledgerFile.originalname.split('.').pop().toLowerCase();
        const bankFileType = bankFile.originalname.split('.').pop().toLowerCase();

        // Validate file types (only CSV and Excel)
        const allowedTypes = ['csv', 'xlsx', 'xls'];
        if (!allowedTypes.includes(ledgerFileType) || !allowedTypes.includes(bankFileType)) {
            // Clean up files
            if (fs.existsSync(ledgerFile.path)) fs.unlinkSync(ledgerFile.path);
            if (fs.existsSync(bankFile.path)) fs.unlinkSync(bankFile.path);
            return res.status(400).json({ message: "Only CSV and Excel files are supported" });
        }

        // Get matching options from request
        const {
            dateToleranceDays = 3,
            amountTolerance = 0,
            descriptionThreshold = 0.7
        } = req.body;

        const options = {
            dateToleranceDays: parseInt(dateToleranceDays) || 3,
            amountTolerance: parseFloat(amountTolerance) || 0,
            descriptionThreshold: parseFloat(descriptionThreshold) || 0.7,
            useTime: false
        };

        // Parse both files
        const [ledgerData, bankData] = await Promise.all([
            processUploadedFile(ledgerFile.path, ledgerFileType),
            processUploadedFile(bankFile.path, bankFileType)
        ]);

        console.log(`Ledger records: ${ledgerData.length}, Bank records: ${bankData.length}`);

        // Run matching algorithm
        const { matched, unmatchedLedger, unmatchedBank } = matchTransactions(ledgerData, bankData, options);

        // Format response
        const formattedMatched = matched.map((m, index) => ({
            id: `M${index + 1}`,
            ledger: {
                id: `L${index + 1}`,
                date: m.ledgerTransaction.date || m.ledgerTransaction.Date,
                amount: parseFloat(m.ledgerTransaction.amount || m.ledgerTransaction.Amount || 0),
                description: m.ledgerTransaction.description || m.ledgerTransaction.Description || '',
                reference: m.ledgerTransaction.reference || m.ledgerTransaction.Reference || ''
            },
            bank: {
                id: `B${index + 1}`,
                date: m.bankTransaction.date || m.bankTransaction.Date,
                amount: parseFloat(m.bankTransaction.amount || m.bankTransaction.Amount || 0),
                description: m.bankTransaction.description || m.bankTransaction.Description || '',
                reference: m.bankTransaction.reference || m.bankTransaction.Reference || ''
            },
            matchScore: m.matchScore,
            matchType: m.matchType,
            differences: m.differences
        }));

        const formattedLedgerOnly = unmatchedLedger.map((tx, index) => ({
            id: `UL${index + 1}`,
            date: tx.date || tx.Date,
            amount: parseFloat(tx.amount || tx.Amount || 0),
            description: tx.description || tx.Description || '',
            reference: tx.reference || tx.Reference || '',
            status: 'Not in Bank Statement',
            possibleReason: 'Outstanding cheque, pending transfer, or timing difference'
        }));

        const formattedBankOnly = unmatchedBank.map((tx, index) => ({
            id: `UB${index + 1}`,
            date: tx.date || tx.Date,
            amount: parseFloat(tx.amount || tx.Amount || 0),
            description: tx.description || tx.Description || '',
            reference: tx.reference || tx.Reference || '',
            status: 'Not in Ledger',
            possibleReason: 'Bank charges, interest, or unrecorded transaction'
        }));

        // Calculate summary
        const summary = {
            totalLedgerRecords: ledgerData.length,
            totalBankRecords: bankData.length,
            matchedCount: matched.length,
            ledgerOnlyCount: unmatchedLedger.length,
            bankOnlyCount: unmatchedBank.length,
            matchRate: ((matched.length / Math.max(ledgerData.length, bankData.length)) * 100).toFixed(2) + '%'
        };

        res.status(200).json({
            message: "Reconciliation completed successfully",
            summary,
            matched: formattedMatched,
            ledgerOnly: formattedLedgerOnly,
            bankOnly: formattedBankOnly
        });

    } catch (error) {
        console.error("Reconciliation error:", error);

        // Clean up files if they exist
        if (req.files) {
            if (req.files.ledgerFile && fs.existsSync(req.files.ledgerFile[0].path)) {
                fs.unlinkSync(req.files.ledgerFile[0].path);
            }
            if (req.files.bankFile && fs.existsSync(req.files.bankFile[0].path)) {
                fs.unlinkSync(req.files.bankFile[0].path);
            }
        }

        res.status(500).json({
            message: "Error during reconciliation",
            error: error.message
        });
    }
});

export default router;