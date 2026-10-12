import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Payroll from "../models/Payroll.js";
import Employee from "../models/Employee.js";

const router = express.Router();

// Helper to get user filter for tenant isolation
const getUserFilter = (req) => {
  const userIdStr = req.user?.id || req.user?._id?.toString();
  if (!userIdStr || userIdStr === "000000000000000000000000") return { userId: null };
  const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr)
    ? new mongoose.Types.ObjectId(userIdStr)
    : null;

  return userObjectId
    ? { $or: [{ userId: userObjectId }, { userId: userIdStr }] }
    : { userId: userIdStr };
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user && req.user.id) return next();
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      ...decoded,
      id: decoded.id || decoded._id?.toString(),
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

// ==========================================
// 👥 EMPLOYEE MANAGEMENT ENDPOINTS
// ==========================================

// 1. Get Employee Directory (with search & status filter)
router.get("/employees", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { status, q, department } = req.query;

    const filter = { ...userFilter };
    if (status && status !== "all") filter.status = status;
    if (department && department !== "all") filter.department = department;

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { employeeId: regex }, { designation: regex }];
    }

    const employees = await Employee.find(filter).sort({ name: 1 }).lean();
    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Failed to fetch employees", error: error.message });
  }
});

// 2. Add New Employee
router.post("/employees", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const {
      employeeId,
      name,
      email,
      phone,
      department,
      designation,
      joiningDate,
      basicSalary,
      da,
      hra,
      travelAllowance,
      otherAllowance,
      bankAccount,
      ifscCode,
      bankName,
    } = req.body;

    if (!name || !employeeId || !department || !designation) {
      return res.status(400).json({ message: "Employee name, ID, department, and designation are required" });
    }

    // Check duplicate employee ID for tenant
    const userId = req.user.id;
    const existing = await Employee.findOne({ userId, employeeId: employeeId.trim() });
    if (existing) {
      return res.status(400).json({ message: `Employee ID '${employeeId}' already exists.` });
    }

    const newEmp = new Employee({
      userId,
      employeeId: employeeId.trim(),
      name: name.trim(),
      email: email ? email.trim() : "",
      phone: phone ? phone.trim() : "",
      department: department.trim(),
      designation: designation.trim(),
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      basicSalary: parseFloat(basicSalary) || 0,
      da: parseFloat(da) || 0,
      hra: parseFloat(hra) || 0,
      travelAllowance: parseFloat(travelAllowance) || 0,
      otherAllowance: parseFloat(otherAllowance) || 0,
      bankAccount: bankAccount ? bankAccount.trim() : "",
      ifscCode: ifscCode ? ifscCode.trim() : "",
      bankName: bankName ? bankName.trim() : "",
      status: "active",
    });

    await newEmp.save();
    res.status(201).json({ message: "Employee added successfully!", employee: newEmp });
  } catch (error) {
    console.error("Error adding employee:", error);
    res.status(500).json({ message: "Failed to add employee", error: error.message });
  }
});

// 3. Get Single Employee Financial Profile & Payroll History
router.get("/employees/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const employee = await Employee.findOne({ _id: req.params.id, ...userFilter }).lean();
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Fetch payroll records for employee
    const payrolls = await Payroll.find({
      $or: [{ employeeRef: employee._id }, { employeeId: employee.employeeId }],
      ...userFilter,
    })
      .sort({ createdAt: -1 })
      .lean();

    let totalSalaryPaid = 0;
    let totalDeductions = 0;
    payrolls.forEach((p) => {
      if (p.status === "paid") {
        totalSalaryPaid += p.netSalary || 0;
      }
      totalDeductions += p.totalDeductions || 0;
    });

    res.json({
      employee,
      financialSummary: {
        currentBasicSalary: employee.basicSalary,
        totalSalaryPaid,
        totalDeductions,
        payrollCount: payrolls.length,
      },
      recentPayrolls: payrolls.slice(0, 12),
    });
  } catch (error) {
    console.error("Error fetching employee profile:", error);
    res.status(500).json({ message: "Failed to fetch employee profile", error: error.message });
  }
});

// 4. Update Employee
router.put("/employees/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const updated = await Employee.findOneAndUpdate(
      { _id: req.params.id, ...userFilter },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ message: "Employee profile updated successfully!", employee: updated });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ message: "Failed to update employee", error: error.message });
  }
});

// 5. Deactivate Employee (Soft Deactivation - Preserves Payroll History)
router.delete("/employees/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const employee = await Employee.findOne({ _id: req.params.id, ...userFilter });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    employee.status = "inactive";
    employee.updatedAt = new Date();
    await employee.save();

    res.json({
      message: `Employee '${employee.name}' deactivated. Historical payroll records preserved.`,
      employee,
    });
  } catch (error) {
    console.error("Error deactivating employee:", error);
    res.status(500).json({ message: "Failed to deactivate employee", error: error.message });
  }
});

// ==========================================
// 📊 PAYROLL CONTROL CENTER & SUMMARY API
// ==========================================

// 6. Payroll Dashboard Summary
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const [employees, monthPayrolls] = await Promise.all([
      Employee.find({ ...userFilter }).lean(),
      Payroll.find({ ...userFilter, payrollMonth: month }).lean(),
    ]);

    const activeEmployees = employees.filter((e) => e.status === "active").length;
    const totalEmployees = employees.length;

    let currentPayrollCost = 0;
    let totalDeductions = 0;
    let netPayroll = 0;
    let pendingPayroll = 0;
    let paidPayroll = 0;
    let missingSalaryInfoCount = 0;

    employees.forEach((e) => {
      if (e.status === "active" && (!e.basicSalary || e.basicSalary <= 0)) {
        missingSalaryInfoCount++;
      }
    });

    monthPayrolls.forEach((p) => {
      currentPayrollCost += p.grossSalary || 0;
      totalDeductions += p.totalDeductions || 0;
      netPayroll += p.netSalary || 0;

      if (p.status === "paid") {
        paidPayroll += p.netSalary || 0;
      } else {
        pendingPayroll += p.netSalary || 0;
      }
    });

    res.json({
      totalEmployees,
      activeEmployees,
      selectedMonth: month,
      currentPayrollCost,
      totalDeductions,
      netPayroll,
      pendingPayroll,
      paidPayroll,
      processedCount: monthPayrolls.length,
      missingSalaryInfoCount,
      actionNeededCount: activeEmployees - monthPayrolls.length + missingSalaryInfoCount,
    });
  } catch (error) {
    console.error("Error fetching payroll summary:", error);
    res.status(500).json({ message: "Failed to fetch payroll summary", error: error.message });
  }
});

// 7. Get All Payroll Records (with month and status filter)
router.get("/all", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { month, status, q } = req.query;

    const filter = { ...userFilter };
    if (month && month !== "all") filter.payrollMonth = month;
    if (status && status !== "all") filter.status = status;

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ employeeName: regex }, { employeeId: regex }, { employeeDepartment: regex }];
    }

    const payrolls = await Payroll.find(filter).sort({ createdAt: -1 }).lean();
    res.json(payrolls);
  } catch (error) {
    console.error("Error fetching payroll data:", error);
    res.status(500).json({ message: "Error fetching payroll data", error: error.message });
  }
});

// 8. Add / Calculate Single Employee Payroll Record
router.post("/add", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body;

    const basic = parseFloat(body.basicSalary) || 0;
    const da = parseFloat(body.da) || 0;
    const hra = parseFloat(body.hra) || 0;
    const travelAllowance = parseFloat(body.travelAllowance) || 0;
    const overtimeAllowance = parseFloat(body.overtimeAllowance) || 0;
    const otherAllowance = parseFloat(body.otherAllowance) || 0;
    const bonuses = parseFloat(body.bonuses) || 0;
    const extraLeaveDeduction = parseFloat(body.extraLeaveDeduction) || 0;

    const grossSalaryCalc =
      basic + da + hra + travelAllowance + overtimeAllowance + otherAllowance + bonuses - extraLeaveDeduction;

    const epfDeductionCalc = 0.12 * grossSalaryCalc;
    const taxDeductionCalc = 0.05 * grossSalaryCalc;

    const pfDeduction = parseFloat(body.pfDeduction) || epfDeductionCalc;
    const esiDeduction = parseFloat(body.esiDeduction) || 0;
    const advanceRecoveryDeduction = parseFloat(body.advanceRecoveryDeduction) || 0;
    const loanDeduction = parseFloat(body.loanDeduction) || 0;
    const otherDeduction = parseFloat(body.otherDeduction) || 0;

    const totalDeductionsCalc =
      pfDeduction + taxDeductionCalc + extraLeaveDeduction + esiDeduction + advanceRecoveryDeduction + loanDeduction + otherDeduction;

    const netSalaryCalc = grossSalaryCalc - totalDeductionsCalc;

    const monthStr = body.payrollMonth || new Date().toISOString().slice(0, 7);

    const newPayroll = new Payroll({
      ...body,
      userId,
      basicSalary: basic,
      da,
      hra,
      travelAllowance,
      overtimeAllowance,
      otherAllowance,
      bonuses,
      grossSalary: grossSalaryCalc,
      pfDeduction,
      epfDeduction: epfDeductionCalc,
      esiDeduction,
      taxDeduction: taxDeductionCalc,
      extraLeaveDeduction,
      advanceRecoveryDeduction,
      loanDeduction,
      otherDeduction,
      totalDeductions: totalDeductionsCalc,
      netSalary: netSalaryCalc,
      payrollMonth: monthStr,
      status: body.status || "calculated",
    });

    await newPayroll.save();
    res.status(201).json({ message: "Payroll data saved successfully!", payroll: newPayroll });
  } catch (error) {
    console.error("Error saving payroll:", error);
    res.status(500).json({ message: "Error saving payroll data", error: error.message });
  }
});

// 9. Batch Generate Payroll for Active Employees
router.post("/process-monthly-batch", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const userId = req.user.id;
    const monthStr = req.body.month || new Date().toISOString().slice(0, 7);

    const activeEmployees = await Employee.find({ ...userFilter, status: "active" }).lean();
    if (activeEmployees.length === 0) {
      return res.status(400).json({ message: "No active employees found to process batch payroll." });
    }

    // Pre-fetch all existing payroll records for month in a single query to eliminate N+1 lookups
    const existingPayrolls = await Payroll.find({ userId, payrollMonth: monthStr }).select("employeeId").lean();
    const existingEmpIdSet = new Set(existingPayrolls.map(p => p.employeeId));

    const bulkOps = [];
    let skippedCount = 0;

    activeEmployees.forEach(emp => {
      if (existingEmpIdSet.has(emp.employeeId)) {
        skippedCount++;
        return;
      }

      const basic = emp.basicSalary || 0;
      const da = emp.da || 0;
      const hra = emp.hra || 0;
      const travelAllowance = emp.travelAllowance || 0;
      const otherAllowance = emp.otherAllowance || 0;

      const grossSalary = basic + da + hra + travelAllowance + otherAllowance;
      const epfDeduction = 0.12 * grossSalary;
      const taxDeduction = 0.05 * grossSalary;
      const totalDeductions = epfDeduction + taxDeduction;
      const netSalary = grossSalary - totalDeductions;

      bulkOps.push({
        insertOne: {
          document: {
            userId,
            employeeRef: emp._id,
            employeeName: emp.name,
            employeeId: emp.employeeId,
            employeeRole: emp.designation,
            employeeDepartment: emp.department,
            payrollMonth: monthStr,
            payrollPeriod: new Date(`${monthStr}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            basicSalary: basic,
            da,
            hra,
            travelAllowance,
            otherAllowance,
            grossSalary,
            epfDeduction,
            taxDeduction,
            totalDeductions,
            netSalary,
            status: "calculated",
            createdAt: new Date()
          }
        }
      });
    });

    if (bulkOps.length > 0) {
      await Payroll.bulkWrite(bulkOps, { ordered: false });
    }

    res.status(201).json({
      message: `Batch payroll created for ${bulkOps.length} employees (${skippedCount} already existed).`,
      createdCount: bulkOps.length,
      skippedCount,
    });
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes("E11000"))) {
      return res.status(200).json({ message: "Batch processing completed with idempotency duplicate protection.", skipped: true });
    }
    console.error("Error processing batch payroll:", error);
    res.status(500).json({ message: "Failed to process batch payroll", error: error.message });
  }
});

// 10. Update Payroll Status (Draft -> Calculated -> Reviewed -> Approved -> Paid)
// Financial Integrity Rule: When status transitions to "paid", automatically create a Bookkeeping entry under Salaries & Payroll expense.
router.put("/:id/status", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { status, paymentMethod } = req.body;

    if (!["draft", "calculated", "reviewed", "approved", "paid"].includes(status)) {
      return res.status(400).json({ message: "Invalid payroll status transition." });
    }

    const payroll = await Payroll.findOne({ _id: req.params.id, ...userFilter });
    if (!payroll) {
      return res.status(404).json({ message: "Payroll record not found" });
    }

    payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;

    if (status === "paid") {
      payroll.paymentDate = new Date();

      // Check if BookkeepingEntry already created to prevent duplicates
      const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
      if (BookkeepingEntry && !payroll.bookkeepingEntryId) {
        const existingEntry = await BookkeepingEntry.findOne({
          userId: req.user.id,
          referenceId: `payroll_${payroll._id}`,
        });

        if (!existingEntry) {
          const newBk = new BookkeepingEntry({
            userId: req.user.id,
            date: new Date(),
            description: `Salary Payment - ${payroll.employeeName} (${payroll.employeeId}) [${payroll.payrollPeriod}]`,
            type: "expense",
            amount: payroll.grossSalary,
            category: "Salaries & Payroll",
            referenceId: `payroll_${payroll._id}`,
            isAutomated: false,
          });

          await newBk.save();
          payroll.bookkeepingEntryId = newBk._id;
        } else {
          payroll.bookkeepingEntryId = existingEntry._id;
        }
      }
    }

    await payroll.save();

    res.json({
      message: `Payroll status updated to '${status.toUpperCase()}'!`,
      payroll,
    });
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes("E11000"))) {
      const existingEntry = await mongoose.model("BookkeepingEntry").findOne({
        userId: req.user.id,
        referenceId: `payroll_${req.params.id}`,
      });
      return res.json({
        message: "Payroll status updated to 'PAID' (Idempotent duplicate handling)",
        bookkeepingEntryId: existingEntry?._id || null,
      });
    }
    console.error("Error updating payroll status:", error);
    res.status(500).json({ message: "Failed to update payroll status", error: error.message });
  }
});

// 11. Specific Employee Payroll History
router.get("/employee/:employeeId", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const payrolls = await Payroll.find({
      employeeId: req.params.employeeId,
      ...userFilter,
    }).sort({ createdAt: -1 });

    res.json(payrolls);
  } catch (error) {
    console.error("Error fetching employee payroll:", error);
    res.status(500).json({ message: "Error fetching employee payroll data", error: error.message });
  }
});

export default router;