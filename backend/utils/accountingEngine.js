import mongoose from "mongoose";
import LedgerAccount from "../models/LedgerAccount.js";
import JournalEntry from "../models/JournalEntry.js";
import StockMovement from "../models/StockMovement.js";
import GstTransaction from "../models/GstTransaction.js";
import CashTransaction from "../models/CashTransaction.js";
import Payment from "../models/Payment.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Invoice from "../models/Invoice.js";

// Helper to safely round numeric values to 2 decimal places
const roundDec = (val) => Math.round((Number(val) || 0) * 100) / 100;

// Helper to adjust ledger account balance following correct double-entry rules
const adjustAccountBalance = (account, debitChange, creditChange) => {
  const d = Number(debitChange) || 0;
  const c = Number(creditChange) || 0;
  if (account.type === "Asset" || account.type === "Expense") {
    account.balance = roundDec(account.balance + d - c);
  } else {
    // Liability, Revenue, Equity
    account.balance = roundDec(account.balance + c - d);
  }
};

/**
 * Seeds the default Chart of Accounts for a user/tenant if they do not exist.
 */
export const seedDefaultAccounts = async (userId) => {
  const defaults = [
    { name: "Accounts Receivable", code: "12000", type: "Asset" },
    { name: "Cash/Bank", code: "10000", type: "Asset" },
    { name: "Inventory Asset", code: "14000", type: "Asset" },
    { name: "Sales Revenue", code: "40000", type: "Revenue" },
    { name: "CGST Payable", code: "22100", type: "Liability" },
    { name: "SGST Payable", code: "22200", type: "Liability" },
    { name: "IGST Payable", code: "22300", type: "Liability" },
    { name: "Cost of Goods Sold", code: "50000", type: "Expense" }
  ];

  const results = [];
  for (const acc of defaults) {
    let account = await LedgerAccount.findOne({ userId, code: acc.code });
    if (!account) {
      account = new LedgerAccount({
        userId,
        name: acc.name,
        code: acc.code,
        type: acc.type,
        balance: 0
      });
      await account.save();
    }
    results.push(account);
  }
  return results;
};

/**
 * Resolves models that are registered inside routes dynamically to avoid circular imports.
 */
const getDynamicModel = (name) => {
  try {
    return mongoose.models[name] || mongoose.model(name);
  } catch (err) {
    console.warn(`Dynamic model ${name} not registered yet:`, err.message);
    return null;
  }
};

/**
 * Updates financial ratios dynamically based on the ledger account state.
 */
export const updateFinancialRatios = async (userId) => {
  try {
    const FinancialRatios = getDynamicModel("FinancialRatios");
    if (!FinancialRatios) return;

    // Fetch accounts
    const accounts = await LedgerAccount.find({ userId });
    const accMap = accounts.reduce((map, acc) => {
      map[acc.name] = acc.balance;
      return map;
    }, {});

    const cash = accMap["Cash/Bank"] || 0;
    const ar = accMap["Accounts Receivable"] || 0;
    const inventory = accMap["Inventory Asset"] || 0;
    const sales = accMap["Sales Revenue"] || 0;
    const cgst = accMap["CGST Payable"] || 0;
    const sgst = accMap["SGST Payable"] || 0;
    const igst = accMap["IGST Payable"] || 0;
    const cogs = accMap["Cost of Goods Sold"] || 0;

    const currentAssets = cash + ar + inventory;
    const currentLiabilities = cgst + sgst + igst;

    const totalAssets = currentAssets;
    const totalLiabilities = currentLiabilities;
    const equity = Math.max(1000, totalAssets - totalLiabilities); // Fallback standard equity

    const revenue = sales;
    const expenses = cogs;
    const netIncome = revenue - expenses;

    // Calculate ratios
    const ratios = {
      currentRatio: currentLiabilities ? currentAssets / currentLiabilities : currentAssets,
      debtToEquity: equity ? totalLiabilities / equity : 0,
      debtRatio: totalAssets ? totalLiabilities / totalAssets : 0,
      quickRatio: currentLiabilities ? (currentAssets - inventory) / currentLiabilities : (currentAssets - inventory),
      grossProfitMargin: revenue ? ((revenue - expenses) / revenue) * 100 : 0,
      netProfitMargin: revenue ? (netIncome / revenue) * 100 : 0,
      roe: equity ? (netIncome / equity) * 100 : 0,
      roa: totalAssets ? (netIncome / totalAssets) * 100 : 0,
      assetsTurnover: totalAssets ? revenue / totalAssets : 0,
      eps: netIncome / 1000 // Mock 1000 shares outstanding
    };

    // Update or insert
    const period = `${new Date().toLocaleString("en-US", { month: "short" })}-${new Date().getFullYear()}`;
    await FinancialRatios.findOneAndUpdate(
      { companyName: "FinSmart Live Ratios", period },
      {
        companyName: "FinSmart Live Ratios",
        period,
        currentAssets,
        currentLiabilities,
        totalAssets,
        totalLiabilities,
        equity,
        totalEquity: equity,
        revenue,
        expenses,
        netIncome,
        totalDebt: totalLiabilities,
        sharesOutstanding: 1000,
        inventory,
        ratios,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );
    console.log("📊 Financial Ratios updated successfully");
  } catch (err) {
    console.error("❌ Failed to update financial ratios:", err.message);
  }
};

/**
 * Central Accounting & Inventory processor for Invoice lifecycle actions.
 */
export const processInvoiceEvent = async (invoiceId, eventType, extraData = null) => {
  console.log(`⚙️ Accounting Engine: Processing ${eventType} for Invoice ID ${invoiceId}`);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) throw new Error("Invoice not found");

    const userId = invoice.userId;
    // Seed default accounts first
    await seedDefaultAccounts(userId);

    const accounts = await LedgerAccount.find({ userId }).session(session);
    const accMap = accounts.reduce((map, acc) => {
      map[acc.name] = acc;
      return map;
    }, {});

    const arAccount = accMap["Accounts Receivable"];
    const salesAccount = accMap["Sales Revenue"];
    const cashAccount = accMap["Cash/Bank"];
    const cgstAccount = accMap["CGST Payable"];
    const sgstAccount = accMap["SGST Payable"];
    const igstAccount = accMap["IGST Payable"];
    const cogsAccount = accMap["Cost of Goods Sold"];
    const inventoryAccount = accMap["Inventory Asset"];

    const InventoryItem = getDynamicModel("InventoryItem");

    if (eventType === "FINALIZED") {
      // ----------------------------------------------------
      // INVOICE FINALIZED (SENT / UNPAID)
      // ----------------------------------------------------
      // Check if entry already exists (e.g. draft edit to send)
      const existingEntry = await JournalEntry.findOne({
        userId,
        referenceType: "INVOICE",
        referenceId: invoiceId
      }).session(session);

      if (existingEntry) {
        // Rollback previous ledger impacts first
        for (const line of existingEntry.lines) {
          const acc = accounts.find(a => a._id.toString() === line.accountId.toString());
          if (acc) {
            adjustAccountBalance(acc, -line.debit, -line.credit);
            await acc.save({ session });
          }
        }
        await JournalEntry.deleteOne({ _id: existingEntry._id }).session(session);
      }

      // Create lines
      const journalLines = [];

      // 1. Debit Accounts Receivable
      journalLines.push({
        accountId: arAccount._id,
        accountName: arAccount.name,
        debit: roundDec(invoice.grandTotal),
        credit: 0
      });
      adjustAccountBalance(arAccount, invoice.grandTotal, 0);
      await arAccount.save({ session });

      // 2. Credit Sales Revenue (subtotal minus discount)
      const netSales = roundDec(invoice.subtotal - invoice.discountAmount + invoice.shippingCharges + invoice.packagingCharges + invoice.freightCharges + invoice.adjustment);
      journalLines.push({
        accountId: salesAccount._id,
        accountName: salesAccount.name,
        debit: 0,
        credit: netSales
      });
      adjustAccountBalance(salesAccount, 0, netSales);
      await salesAccount.save({ session });

      // 3. Credit Tax accounts
      if (invoice.cgst > 0) {
        journalLines.push({
          accountId: cgstAccount._id,
          accountName: cgstAccount.name,
          debit: 0,
          credit: roundDec(invoice.cgst)
        });
        adjustAccountBalance(cgstAccount, 0, invoice.cgst);
        await cgstAccount.save({ session });
      }
      if (invoice.sgst > 0) {
        journalLines.push({
          accountId: sgstAccount._id,
          accountName: sgstAccount.name,
          debit: 0,
          credit: roundDec(invoice.sgst)
        });
        adjustAccountBalance(sgstAccount, 0, invoice.sgst);
        await sgstAccount.save({ session });
      }
      if (invoice.igst > 0) {
        journalLines.push({
          accountId: igstAccount._id,
          accountName: igstAccount.name,
          debit: 0,
          credit: roundDec(invoice.igst)
        });
        adjustAccountBalance(igstAccount, 0, invoice.igst);
        await igstAccount.save({ session });
      }

      // Save journal entry
      const je = new JournalEntry({
        userId,
        entryNumber: `JE-INV-${invoice.invoiceNumber}`,
        date: invoice.invoiceDate,
        description: `Revenue recognized for Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
        referenceType: "INVOICE",
        referenceId: invoice._id,
        lines: journalLines
      });
      await je.save({ session });

      // Create Stock movements & update item stock
      for (const item of invoice.items) {
        if (item.productId && InventoryItem) {
          const invItem = await InventoryItem.findById(item.productId).session(session);
          if (invItem) {
            // Deduct stock if not already reserved
            if (!item.stockReserved) {
              invItem.quantity = Math.max(0, invItem.quantity - item.quantity);
              invItem.lastUpdated = new Date();
              await invItem.save({ session });
            }

            // Record movement
            const movement = new StockMovement({
              userId,
              productId: item.productId,
              referenceType: "INVOICE",
              referenceId: invoice._id,
              movementType: "OUT",
              quantity: item.quantity
            });
            await movement.save({ session });

            // Record COGS ledger booking if item cost is available
            const unitCost = invItem.cost || roundDec(item.unitPrice * 0.6); // Mock 60% margin if cost missing
            const totalCOGS = roundDec(unitCost * item.quantity);

            // COGS Entry: Debit Cost of Goods Sold, Credit Inventory Asset
            const cogsLines = [
              { accountId: cogsAccount._id, accountName: cogsAccount.name, debit: totalCOGS, credit: 0 },
              { accountId: inventoryAccount._id, accountName: inventoryAccount.name, debit: 0, credit: totalCOGS }
            ];

            const cogsJE = new JournalEntry({
              userId,
              entryNumber: `JE-COGS-${invoice.invoiceNumber}-${invItem.sku}`,
              date: invoice.invoiceDate,
              description: `Cost of goods sold recognized for ${invItem.itemName} in invoice ${invoice.invoiceNumber}`,
              referenceType: "INVOICE",
              referenceId: invoice._id,
              lines: cogsLines
            });
            await cogsJE.save({ session });

            adjustAccountBalance(cogsAccount, totalCOGS, 0);
            adjustAccountBalance(inventoryAccount, 0, totalCOGS);
            await Promise.all([cogsAccount.save({ session }), inventoryAccount.save({ session })]);
          }
        }
      }

      // Sync to standard bookkeeping
      await BookkeepingEntry.findOneAndUpdate(
        { userId, description: `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}` },
        {
          userId,
          date: invoice.invoiceDate,
          description: `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          category: "Sales",
          amount: invoice.grandTotal,
          type: "income"
        },
        { upsert: true, session }
      );

      // Sync to TaxGST routes collection
      const TaxGST = getDynamicModel("TaxGST");
      if (TaxGST) {
        await TaxGST.findOneAndUpdate(
          { invoiceNumber: invoice.invoiceNumber },
          {
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate.toISOString().split("T")[0],
            baseAmount: invoice.subtotal,
            gstRate: invoice.items[0]?.taxRate || 18,
            transactionType: invoice.igst > 0 ? "interstate" : "intrastate",
            cgst: invoice.cgst,
            sgst: invoice.sgst,
            igst: invoice.igst,
            total: invoice.grandTotal
          },
          { upsert: true, session }
        );
      }

      // If invoice has pre-paid cash amount (e.g. Paid amount during creation)
      if (invoice.amountPaid > 0) {
        const paymentNumber = `PMT-${invoice.invoiceNumber}-01`;
        const existingPayment = await Payment.findOne({ userId, invoiceId: invoice._id }).session(session);

        if (!existingPayment) {
          const pay = new Payment({
            userId,
            invoiceId: invoice._id,
            paymentNumber,
            amount: invoice.amountPaid,
            paymentDate: invoice.invoiceDate,
            paymentMethod: invoice.paymentMethod || 'cash',
            notes: "Payment recorded during invoice creation."
          });
          await pay.save({ session });

          // Payment ledger bookings: Debit Cash/Bank, Credit Accounts Receivable
          const payLines = [
            { accountId: cashAccount._id, accountName: cashAccount.name, debit: roundDec(invoice.amountPaid), credit: 0 },
            { accountId: arAccount._id, accountName: arAccount.name, debit: 0, credit: roundDec(invoice.amountPaid) }
          ];

          const payJE = new JournalEntry({
            userId,
            entryNumber: `JE-PAY-${paymentNumber}`,
            date: invoice.invoiceDate,
            description: `Payment receipt applied against invoice ${invoice.invoiceNumber}`,
            referenceType: "PAYMENT",
            referenceId: pay._id,
            lines: payLines
          });
          await payJE.save({ session });

          adjustAccountBalance(cashAccount, invoice.amountPaid, 0);
          adjustAccountBalance(arAccount, 0, invoice.amountPaid);
          await Promise.all([cashAccount.save({ session }), arAccount.save({ session })]);

          // Create Cash Flow Statement entry
          const CashFlowEntry = getDynamicModel("CashFlowEntry");
          if (CashFlowEntry) {
            const lastCF = await CashFlowEntry.findOne({ userId }).sort({ time: -1 }).session(session);
            const nextTime = lastCF ? lastCF.time + 1 : 0;
            const cf = new CashFlowEntry({
              userId,
              year: invoice.invoiceDate.getFullYear().toString(),
              month: invoice.invoiceDate.toLocaleString('en-US', { month: 'short' }),
              cashInflow: invoice.amountPaid,
              cashOutflow: 0,
              netCashFlow: invoice.amountPaid,
              time: nextTime,
              description: `Prepayment received for invoice ${invoice.invoiceNumber}`,
              category: "Sales"
            });
            await cf.save({ session });
          }

          // Note: Payment receipt is a collection on Accounts Receivable, not new sales revenue.
          // The Sales Invoice already records the revenue entry. Recording payment as an additional
          // "Sales" income entry would duplicate sales revenue. Cash movement is tracked in CashTransaction.

          // Record actual cash transaction
          const cashTx = new CashTransaction({
            userId,
            date: invoice.invoiceDate,
            description: `Payment receipt for invoice ${invoice.invoiceNumber}`,
            type: "inflow",
            amount: invoice.amountPaid,
            paymentMethod: invoice.paymentMethod || 'cash',
            referenceType: "PAYMENT",
            referenceId: pay._id
          });
          await cashTx.save({ session });
        }
      }

    } else if (eventType === "PAYMENT_RECORDED") {
      // ----------------------------------------------------
      // PAYMENT RECORDED FOR AN UNPAID INVOICE
      // ----------------------------------------------------
      const { amount, paymentDate, paymentMethod, depositAccount, referenceNumber, notes } = extraData;

      const pCount = await Payment.countDocuments({ userId, invoiceId: invoice._id }).session(session);
      const paymentNumber = `PMT-${invoice.invoiceNumber}-${(pCount + 1).toString().padStart(2, '0')}`;

      const pay = new Payment({
        userId,
        invoiceId: invoice._id,
        paymentNumber,
        amount: roundDec(amount),
        paymentDate: new Date(paymentDate),
        paymentMethod,
        depositAccount,
        referenceNumber,
        notes
      });
      await pay.save({ session });

      // Ledger: Debit Cash/Bank, Credit Accounts Receivable
      const payLines = [
        { accountId: cashAccount._id, accountName: cashAccount.name, debit: roundDec(amount), credit: 0 },
        { accountId: arAccount._id, accountName: arAccount.name, debit: 0, credit: roundDec(amount) }
      ];

      const payJE = new JournalEntry({
        userId,
        entryNumber: `JE-PAY-${paymentNumber}`,
        date: new Date(paymentDate),
        description: `Payment receipt #${paymentNumber} applied against invoice ${invoice.invoiceNumber}`,
        referenceType: "PAYMENT",
        referenceId: pay._id,
        lines: payLines
      });
      await payJE.save({ session });

      adjustAccountBalance(cashAccount, amount, 0);
      adjustAccountBalance(arAccount, 0, amount);
      await Promise.all([cashAccount.save({ session }), arAccount.save({ session })]);

      // Cash Flow statement sync
      const CashFlowEntry = getDynamicModel("CashFlowEntry");
      if (CashFlowEntry) {
        const lastCF = await CashFlowEntry.findOne({ userId }).sort({ time: -1 }).session(session);
        const nextTime = lastCF ? lastCF.time + 1 : 0;
        const cfDate = new Date(paymentDate);
        const cf = new CashFlowEntry({
          userId,
          year: cfDate.getFullYear().toString(),
          month: cfDate.toLocaleString('en-US', { month: 'short' }),
          cashInflow: amount,
          cashOutflow: 0,
          netCashFlow: amount,
          time: nextTime,
          description: `Payment received for invoice ${invoice.invoiceNumber}`,
          category: "Sales"
        });
        await cf.save({ session });
      }

      // Note: Payment receipt is a collection on Accounts Receivable, not new sales revenue.
      // Sales revenue is recognized when the Sales Invoice is finalized. Adding another "Sales"
      // income entry would duplicate sales revenue in financial reports. Cash is tracked in CashTransaction.

      // Record cash transaction
      const cashTx = new CashTransaction({
        userId,
        date: new Date(paymentDate),
        description: `Payment receipt #${paymentNumber} for invoice ${invoice.invoiceNumber}`,
        type: "inflow",
        amount: amount,
        paymentMethod,
        referenceType: "PAYMENT",
        referenceId: pay._id
      });
      await cashTx.save({ session });

      // Update invoice values with strict capping
      invoice.amountPaid = Math.min(invoice.grandTotal, roundDec(invoice.amountPaid + amount));
      invoice.balanceDue = Math.max(0, roundDec(invoice.grandTotal - invoice.amountPaid));
      invoice.paymentStatus = invoice.balanceDue <= 0 ? 'paid' : 'partial';
      invoice.status = invoice.balanceDue <= 0 ? 'paid' : (invoice.status === 'draft' ? 'sent' : invoice.status);
      invoice.updatedAt = new Date();
      await invoice.save({ session });

    } else if (eventType === "CANCELLED") {
      // ----------------------------------------------------
      // INVOICE CANCELLED
      // ----------------------------------------------------
      invoice.status = 'cancelled';
      invoice.paymentStatus = 'cancelled';
      invoice.balanceDue = invoice.grandTotal;
      invoice.amountPaid = 0;
      invoice.updatedAt = new Date();
      await invoice.save({ session });

      // Create reversing journal entries
      const originalEntry = await JournalEntry.findOne({
        userId,
        referenceType: "INVOICE",
        referenceId: invoiceId
      }).session(session);

      if (originalEntry) {
        const revLines = originalEntry.lines.map(line => ({
          accountId: line.accountId,
          accountName: line.accountName,
          debit: line.credit, // Debit becomes Credit
          credit: line.debit  // Credit becomes Debit
        }));

        const revJE = new JournalEntry({
          userId,
          entryNumber: `JE-REV-${invoice.invoiceNumber}`,
          date: new Date(),
          description: `Reversal entry for cancelled invoice ${invoice.invoiceNumber}`,
          referenceType: "REVERSAL",
          referenceId: invoice._id,
          lines: revLines
        });
        await revJE.save({ session });

        // Update Ledger accounts
        for (const line of revLines) {
          const acc = accounts.find(a => a._id.toString() === line.accountId.toString());
          if (acc) {
            adjustAccountBalance(acc, line.debit, line.credit);
            await acc.save({ session });
          }
        }
      }

      // Restore Inventory stock and create reversing movements
      for (const item of invoice.items) {
        if (item.productId && InventoryItem) {
          const invItem = await InventoryItem.findById(item.productId).session(session);
          if (invItem) {
            invItem.quantity += item.quantity;
            invItem.lastUpdated = new Date();
            await invItem.save({ session });

            const movement = new StockMovement({
              userId,
              productId: item.productId,
              referenceType: "REVERSAL",
              referenceId: invoice._id,
              movementType: "IN",
              quantity: item.quantity
            });
            await movement.save({ session });
          }
        }
      }

      // Delete/Rollback corresponding bookkeeping entries
      await BookkeepingEntry.deleteMany({
        userId,
        description: { $regex: invoice.invoiceNumber }
      }).session(session);

      // Delete/Rollback GST records
      const TaxGST = getDynamicModel("TaxGST");
      if (TaxGST) {
        await TaxGST.deleteMany({ invoiceNumber: invoice.invoiceNumber }).session(session);
      }

      // If payments exist, reverse payments ledger bookings
      const payments = await Payment.find({ userId, invoiceId: invoice._id }).session(session);
      for (const p of payments) {
        const payRevLines = [
          { accountId: arAccount._id, accountName: arAccount.name, debit: roundDec(p.amount), credit: 0 },
          { accountId: cashAccount._id, accountName: cashAccount.name, debit: 0, credit: roundDec(p.amount) }
        ];

        const payRevJE = new JournalEntry({
          userId,
          entryNumber: `JE-REV-PAY-${p.paymentNumber}`,
          date: new Date(),
          description: `Reversal of payment #${p.paymentNumber} due to invoice cancellation`,
          referenceType: "REVERSAL",
          referenceId: p._id,
          lines: payRevLines
        });
        await payRevJE.save({ session });

        adjustAccountBalance(arAccount, p.amount, 0);
        adjustAccountBalance(cashAccount, 0, p.amount);
        await Promise.all([arAccount.save({ session }), cashAccount.save({ session })]);
      }

      await Payment.deleteMany({ userId, invoiceId: invoice._id }).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    // Trigger update of financial ratios outside the transaction
    await updateFinancialRatios(userId);
    console.log(`✅ Accounting Engine: Completed event processing successfully`);

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(`❌ Accounting Engine failed processing event:`, error);
    throw error;
  }
};
