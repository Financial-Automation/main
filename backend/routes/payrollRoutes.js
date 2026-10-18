import express from "express";
import Payroll from "../models/Payroll.js";
import { upsertAutomatedBookkeepingEntry, removeAutomatedBookkeepingEntry } from "../utils/bookkeepingHelper.js";

const router = express.Router();

// ✅ POST route to store enhanced payroll data with authoritative calculation & bookkeeping integration
router.post("/add", async (req, res) => {
  try {
    const data = req.body || {};
    const userId = req.user.id;

    // Numerical validation
    const basicSalary = Math.max(0, parseFloat(data.basicSalary) || 0);
    const da = Math.max(0, parseFloat(data.da) || 0);
    const hra = Math.max(0, parseFloat(data.hra) || 0);
    const travelAllowance = Math.max(0, parseFloat(data.travelAllowance) || 0);
    const overtimeAllowance = Math.max(0, parseFloat(data.overtimeAllowance) || 0);
    const otherAllowance = Math.max(0, parseFloat(data.otherAllowance) || 0);
    const bonuses = Math.max(0, parseFloat(data.bonuses) || 0);

    const extraLeaveDeduction = Math.max(0, parseFloat(data.extraLeaveDeduction) || 0);
    const advanceRecoveryDeduction = Math.max(0, parseFloat(data.advanceRecoveryDeduction) || 0);
    const loanDeduction = Math.max(0, parseFloat(data.loanDeduction) || 0);
    const otherDeduction = Math.max(0, parseFloat(data.otherDeduction) || 0);
    const esiDeduction = Math.max(0, parseFloat(data.esiDeduction) || 0);

    // Calculate Gross Salary
    const grossSalaryCalc = Math.max(
      0,
      basicSalary + da + hra + travelAllowance + overtimeAllowance + otherAllowance + bonuses - extraLeaveDeduction
    );

    // Auto/Manual PF & Tax
    const epfDeductionCalc = Math.max(0, parseFloat(data.epfDeduction) || (0.12 * grossSalaryCalc));
    const taxDeductionCalc = Math.max(0, parseFloat(data.taxDeduction) || (0.05 * grossSalaryCalc));
    const pfDeduction = Math.max(0, parseFloat(data.pfDeduction) || epfDeductionCalc);

    // Total deductions
    const totalDeductionsCalc = pfDeduction + taxDeductionCalc + extraLeaveDeduction + esiDeduction + advanceRecoveryDeduction + loanDeduction + otherDeduction;
    const netSalaryCalc = Math.max(0, grossSalaryCalc - totalDeductionsCalc);

    const payrollData = {
      userId,
      employeeName: data.employeeName || "Employee",
      employeeId: data.employeeId || `EMP-${Date.now()}`,
      employeeRole: data.employeeRole || "Staff",
      employeeDepartment: data.employeeDepartment || "General",
      employeeExperience: parseFloat(data.employeeExperience) || 0,
      basicSalary,
      da,
      hra,
      travelAllowance,
      overtimeAllowance,
      otherAllowance,
      bonuses,
      grossSalary: data.grossSalary !== undefined ? Math.max(0, parseFloat(data.grossSalary) || grossSalaryCalc) : grossSalaryCalc,
      pfDeduction,
      epfDeduction: epfDeductionCalc,
      esiDeduction,
      taxDeduction: taxDeductionCalc,
      extraLeaveDeduction,
      advanceRecoveryDeduction,
      loanDeduction,
      otherDeduction,
      totalDeductions: data.totalDeductions !== undefined ? Math.max(0, parseFloat(data.totalDeductions) || totalDeductionsCalc) : totalDeductionsCalc,
      netSalary: data.netSalary !== undefined ? Math.max(0, parseFloat(data.netSalary) || netSalaryCalc) : netSalaryCalc,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    };

    const newPayroll = new Payroll(payrollData);
    await newPayroll.save();

    // Automatically generate Bookkeeping Entry for Salaries expense
    const salaryExpenseAmount = newPayroll.grossSalary || newPayroll.netSalary;
    if (salaryExpenseAmount > 0) {
      await upsertAutomatedBookkeepingEntry({
        userId,
        date: newPayroll.createdAt || new Date(),
        description: `Payroll Salary: ${newPayroll.employeeName} (${newPayroll.employeeId})`,
        category: "Salaries",
        amount: salaryExpenseAmount,
        type: "expense",
        referenceId: `payroll_${newPayroll._id}`
      });
    }

    res.status(201).json({ 
      message: "Payroll data saved successfully!", 
      payroll: newPayroll 
    });
  } catch (error) {
    console.error("Error saving payroll:", error);
    res.status(500).json({ message: "Error saving payroll data", error: error.message });
  }
});

// ✅ GET route to fetch all payroll records for authenticated user
router.get("/all", async (req, res) => {
  try {
    const payrolls = await Payroll.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(payrolls);
  } catch (error) {
    console.error("Error fetching payroll data:", error);
    res.status(500).json({ message: "Error fetching payroll data" });
  }
});

// ✅ GET route for specific employee payroll history for authenticated user
router.get("/employee/:employeeId", async (req, res) => {
  try {
    const payrolls = await Payroll.find({ 
      employeeId: req.params.employeeId, 
      userId: req.user.id 
    }).sort({ createdAt: -1 });
    res.json(payrolls);
  } catch (error) {
    console.error("Error fetching employee payroll:", error);
    res.status(500).json({ message: "Error fetching employee payroll data" });
  }
});

// ✅ DELETE route to void/delete a payroll run and clean up accounting ledger
router.delete("/:id", async (req, res) => {
  try {
    const deletedPayroll = await Payroll.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!deletedPayroll) {
      return res.status(404).json({ message: "Payroll record not found or access denied" });
    }

    // Clean up automated bookkeeping entry
    await removeAutomatedBookkeepingEntry({
      userId: req.user.id,
      referenceId: `payroll_${deletedPayroll._id}`
    });

    res.json({ message: "Payroll record deleted successfully" });
  } catch (error) {
    console.error("Error deleting payroll record:", error);
    res.status(500).json({ message: "Error deleting payroll record", error: error.message });
  }
});

export default router;