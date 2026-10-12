import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  Users,
  IndianRupee,
  Plus,
  Search,
  Filter,
  ArrowLeft,
  Phone,
  Mail,
  Building,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Download,
  Calculator,
  UserCheck,
  UserX,
  Edit,
  Eye,
  Trash2,
  Loader2,
  DollarSign,
  Send,
  CreditCard,
  Building2,
  ShieldCheck,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import { DEFAULT_REPORT_COMPANY_NAME, getReportCompanyName } from "@/lib/reportBranding";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Employee {
  _id: string;
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  department: string;
  designation: string;
  joiningDate?: string;
  basicSalary: number;
  da: number;
  hra: number;
  travelAllowance: number;
  otherAllowance: number;
  bankAccount?: string;
  ifscCode?: string;
  bankName?: string;
  status: "active" | "inactive";
}

interface PayrollSummary {
  totalEmployees: number;
  activeEmployees: number;
  selectedMonth: string;
  currentPayrollCost: number;
  totalDeductions: number;
  netPayroll: number;
  pendingPayroll: number;
  paidPayroll: number;
  processedCount: number;
  missingSalaryInfoCount: number;
  actionNeededCount: number;
}

interface PayrollRecord {
  _id: string;
  employeeName: string;
  employeeId: string;
  employeeRole: string;
  employeeDepartment: string;
  payrollMonth: string;
  payrollPeriod: string;
  basicSalary: number;
  da: number;
  hra: number;
  travelAllowance: number;
  overtimeAllowance: number;
  otherAllowance: number;
  bonuses: number;
  grossSalary: number;
  pfDeduction: number;
  epfDeduction: number;
  esiDeduction: number;
  taxDeduction: number;
  extraLeaveDeduction: number;
  advanceRecoveryDeduction: number;
  loanDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netSalary: number;
  status: "draft" | "calculated" | "reviewed" | "approved" | "paid";
  paymentDate?: string;
  paymentMethod?: string;
  createdAt: string;
}

export const Payroll = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();

  const [activeTab, setActiveTab] = useState<string>("control-center");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  // Data States
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingBatch, setProcessingBatch] = useState<boolean>(false);

  // Filters
  const [employeeSearch, setEmployeeSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // Modals
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState<boolean>(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeProfileData, setEmployeeProfileData] = useState<any>(null);
  const [submittingEmployee, setSubmittingEmployee] = useState<boolean>(false);

  // Form State for Employee
  const [empForm, setEmpForm] = useState({
    employeeId: "",
    name: "",
    email: "",
    phone: "",
    department: "Engineering",
    designation: "Software Engineer",
    basicSalary: "",
    da: "",
    hra: "",
    travelAllowance: "",
    otherAllowance: "",
    bankAccount: "",
    ifscCode: "",
    bankName: "",
  });

  useEffect(() => {
    fetchSummaryAndData();
  }, [selectedMonth, statusFilter, departmentFilter, employeeSearch]);

  const fetchSummaryAndData = async () => {
    try {
      setLoading(true);
      const [sumRes, empRes, payRes] = await Promise.all([
        apiRequest(`${API_BASE_URL}/api/payroll/summary?month=${selectedMonth}`),
        apiRequest(`${API_BASE_URL}/api/payroll/employees?q=${encodeURIComponent(employeeSearch)}&status=${statusFilter}&department=${departmentFilter}`),
        apiRequest(`${API_BASE_URL}/api/payroll/all?month=${selectedMonth}`)
      ]);

      setSummary(sumRes);
      setEmployees(Array.isArray(empRes) ? empRes : []);
      setPayrolls(Array.isArray(payRes) ? payRes : []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load payroll control center.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddEmployee = () => {
    setEmpForm({
      employeeId: `EMP${Math.floor(100 + Math.random() * 900)}`,
      name: "",
      email: "",
      phone: "",
      department: "Engineering",
      designation: "Software Engineer",
      basicSalary: "40000",
      da: "4000",
      hra: "8000",
      travelAllowance: "2000",
      otherAllowance: "1000",
      bankAccount: "",
      ifscCode: "",
      bankName: "",
    });
    setIsAddEmployeeModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEmpForm({
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email || "",
      phone: emp.phone || "",
      department: emp.department,
      designation: emp.designation,
      basicSalary: emp.basicSalary.toString(),
      da: (emp.da || 0).toString(),
      hra: (emp.hra || 0).toString(),
      travelAllowance: (emp.travelAllowance || 0).toString(),
      otherAllowance: (emp.otherAllowance || 0).toString(),
      bankAccount: emp.bankAccount || "",
      ifscCode: emp.ifscCode || "",
      bankName: emp.bankName || "",
    });
    setIsEditEmployeeModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name.trim() || !empForm.employeeId.trim()) {
      toast.error("Employee Name and ID are required.");
      return;
    }

    try {
      setSubmittingEmployee(true);
      if (selectedEmployee) {
        await apiRequest(`${API_BASE_URL}/api/payroll/employees/${selectedEmployee._id}`, {
          method: "PUT",
          body: JSON.stringify(empForm),
        });
        toast.success("Employee profile updated!");
        setIsEditEmployeeModalOpen(false);
      } else {
        await apiRequest(`${API_BASE_URL}/api/payroll/employees`, {
          method: "POST",
          body: JSON.stringify(empForm),
        });
        toast.success("New employee registered successfully!");
        setIsAddEmployeeModalOpen(false);
      }
      fetchSummaryAndData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save employee profile.");
    } finally {
      setSubmittingEmployee(false);
    }
  };

  const handleDeactivateEmployee = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to deactivate employee '${emp.name}'? Historical payroll records will be preserved.`)) return;
    try {
      const res = await apiRequest(`${API_BASE_URL}/api/payroll/employees/${emp._id}`, {
        method: "DELETE",
      });
      toast.success(res.message || "Employee deactivated.");
      fetchSummaryAndData();
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate employee.");
    }
  };

  const handleViewEmployeeProfile = async (emp: Employee) => {
    try {
      setSelectedEmployee(emp);
      const data = await apiRequest(`${API_BASE_URL}/api/payroll/employees/${emp._id}`);
      setEmployeeProfileData(data);
      setIsProfileModalOpen(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to load employee profile.");
    }
  };

  const handleBatchProcessPayroll = async () => {
    try {
      setProcessingBatch(true);
      const res = await apiRequest(`${API_BASE_URL}/api/payroll/process-monthly-batch`, {
        method: "POST",
        body: JSON.stringify({ month: selectedMonth }),
      });
      toast.success(res.message || "Monthly payroll batch processed!");
      fetchSummaryAndData();
    } catch (error: any) {
      toast.error(error.message || "Failed to process batch payroll.");
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleUpdatePayrollStatus = async (payrollId: string, newStatus: string) => {
    try {
      const res = await apiRequest(`${API_BASE_URL}/api/payroll/${payrollId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(res.message || `Payroll status updated to ${newStatus.toUpperCase()}`);
      fetchSummaryAndData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update payroll status.");
    }
  };

  const downloadPayslipPDF = (rec: PayrollRecord) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Blue Header Banner
    doc.setFillColor(26, 54, 164);
    doc.rect(0, 0, pageWidth, 38, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(getReportCompanyName(DEFAULT_REPORT_COMPANY_NAME), pageWidth / 2, 14, { align: "center" });

    doc.setFontSize(18);
    doc.text("SALARY PAYSLIP", pageWidth / 2, 26, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Payroll Period: ${rec.payrollPeriod || rec.payrollMonth}`, pageWidth / 2, 48, { align: "center" });

    const startX = 15;
    const contentWidth = pageWidth - 30;

    let y = 56;
    doc.setFillColor(248, 250, 252);
    doc.rect(startX, y, contentWidth, 32, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(startX, y, contentWidth, 32, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text("EMPLOYEE DETAILS", startX + 5, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Name: ${rec.employeeName}`, startX + 5, y + 14);
    doc.text(`Employee ID: ${rec.employeeId}`, startX + 5, y + 21);
    doc.text(`Department: ${rec.employeeDepartment}`, startX + 5, y + 28);

    doc.text(`Designation: ${rec.employeeRole}`, startX + contentWidth / 2, y + 14);
    doc.text(`Payment Status: ${(rec.status || 'draft').toUpperCase()}`, startX + contentWidth / 2, y + 21);

    y += 40;
    const colWidth = (contentWidth - 10) / 2;
    const rightColX = startX + colWidth + 10;

    doc.setFillColor(239, 246, 255);
    doc.rect(startX, y, colWidth, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text("EARNINGS", startX + 3, y + 5.5);

    doc.setFillColor(254, 242, 242);
    doc.rect(rightColX, y, colWidth, 8, "F");
    doc.setTextColor(220, 38, 38);
    doc.text("DEDUCTIONS", rightColX + 3, y + 5.5);

    const earnings = [
      { label: "Basic Salary", val: rec.basicSalary },
      { label: "Dearness Allowance (DA)", val: rec.da },
      { label: "House Rent (HRA)", val: rec.hra },
      { label: "Travel Allowance", val: rec.travelAllowance },
      { label: "Other Allowance", val: rec.otherAllowance },
      { label: "Bonuses", val: rec.bonuses },
    ];

    const deductions = [
      { label: "EPF (12% Auto)", val: rec.epfDeduction },
      { label: "Tax / TDS (5% Auto)", val: rec.taxDeduction },
      { label: "ESI Deduction", val: rec.esiDeduction },
      { label: "Leave / Extra Deductions", val: rec.extraLeaveDeduction },
    ];

    let currentY = y + 14;
    doc.setFontSize(8.5);

    const maxRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < maxRows; i++) {
      if (i < earnings.length) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(earnings[i].label, startX + 3, currentY);
        doc.text(`Rs. ${earnings[i].val.toLocaleString('en-IN')}`, startX + colWidth - 3, currentY, { align: "right" });
      }

      if (i < deductions.length) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        doc.text(deductions[i].label, rightColX + 3, currentY);
        doc.text(`Rs. ${deductions[i].val.toLocaleString('en-IN')}`, rightColX + colWidth - 3, currentY, { align: "right" });
      }

      currentY += 8;
    }

    currentY += 4;
    doc.setFillColor(15, 23, 42);
    doc.rect(startX, currentY, contentWidth, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text("NET SALARY PAYABLE", startX + 5, currentY + 7.5);
    doc.setTextColor(147, 197, 253);
    doc.text(`Rs. ${rec.netSalary.toLocaleString('en-IN')}`, startX + contentWidth - 5, currentY + 7.5, { align: "right" });

    doc.save(`Payslip_${rec.employeeId}_${rec.payrollMonth}.pdf`);
    toast.success("Payslip PDF downloaded.");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border-slate-200"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <IndianRupee className="h-7 w-7 text-indigo-600" />
              Payroll & Employee Financial Control Center
            </h1>
            <p className="text-sm text-slate-500">
              Manage employee salary structures, process monthly payroll, generate payslips & post bookkeeping.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40 rounded-xl border-slate-200 bg-white font-semibold text-xs"
          />
          <Button
            onClick={handleBatchProcessPayroll}
            disabled={processingBatch}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md gap-2 text-xs"
          >
            {processingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calculate Monthly Batch
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p>Loading payroll and employee financial records...</p>
        </div>
      ) : summary ? (
        <>
          {/* Action Needed Alert Banner */}
          {summary.actionNeededCount > 0 && (
            <Card className="rounded-2xl border-amber-300 bg-amber-50/90 shadow-sm overflow-hidden">
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-amber-900">
                      Payroll Action Required for {selectedMonth}
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      {summary.activeEmployees - summary.processedCount > 0
                        ? `${summary.activeEmployees - summary.processedCount} active employee(s) require monthly payroll processing.`
                        : `${summary.missingSalaryInfoCount} employee(s) missing basic salary structure.`}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleBatchProcessPayroll}
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs gap-1.5"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Process Monthly Payroll
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 4 Core Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Active Employees */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Employees</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{summary.activeEmployees}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Total registered: {summary.totalEmployees}</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Users className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Gross Payroll Cost */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Payroll Cost</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summary.currentPayrollCost.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">For {summary.selectedMonth}</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Net Payroll Payable */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Payroll Payable</p>
                  <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                    ₹{summary.netPayroll.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">After EPF & TDS deductions</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Pending Payments */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Payroll</p>
                  <h3 className="text-2xl font-bold text-amber-600 mt-1">
                    ₹{summary.pendingPayroll.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Awaiting payout finalization</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1 w-full sm:w-auto">
              <TabsTrigger value="control-center" className="rounded-xl text-xs font-semibold">
                Payroll Processing ({payrolls.length})
              </TabsTrigger>
              <TabsTrigger value="employees" className="rounded-xl text-xs font-semibold">
                Employee Directory ({employees.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: PAYROLL PROCESSING & WORKFLOW */}
            <TabsContent value="control-center" className="space-y-4">
              <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900">
                      Payroll Records for {selectedMonth} ({payrolls.length})
                    </CardTitle>
                    <CardDescription>
                      Review, approve, and finalize salary payouts with automated bookkeeping integration.
                    </CardDescription>
                  </div>

                  <Button
                    onClick={handleBatchProcessPayroll}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Calculate All Active Employees
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {payrolls.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 space-y-3">
                      <IndianRupee className="h-8 w-8 text-slate-400 mx-auto" />
                      <p className="font-semibold text-slate-900">No Payroll Records Processed for {selectedMonth}</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Click 'Calculate All Active Employees' to generate draft payroll records automatically from employee salary structures.
                      </p>
                      <Button
                        onClick={handleBatchProcessPayroll}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-2"
                      >
                        <Calculator className="h-4 w-4" />
                        Generate Monthly Payroll Batch
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3.5">Employee</th>
                            <th className="px-6 py-3.5">Department / Role</th>
                            <th className="px-6 py-3.5 text-right">Gross Salary</th>
                            <th className="px-6 py-3.5 text-right">Deductions</th>
                            <th className="px-6 py-3.5 text-right">Net Payable</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-slate-800">
                          {payrolls.map((rec) => (
                            <tr key={rec._id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-900">{rec.employeeName}</div>
                                <div className="text-xs font-mono text-slate-500">{rec.employeeId}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-slate-900">{rec.employeeRole}</div>
                                <div className="text-xs text-slate-500">{rec.employeeDepartment}</div>
                              </td>
                              <td className="px-6 py-4 text-right font-medium">
                                ₹{rec.grossSalary.toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4 text-right font-medium text-red-600">
                                - ₹{rec.totalDeductions.toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-emerald-700">
                                ₹{rec.netSalary.toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4">
                                {rec.status === "paid" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-none">Paid & Booked</Badge>
                                ) : rec.status === "approved" ? (
                                  <Badge className="bg-blue-100 text-blue-800 border-none">Approved</Badge>
                                ) : rec.status === "reviewed" ? (
                                  <Badge className="bg-indigo-100 text-indigo-800 border-none">Reviewed</Badge>
                                ) : (
                                  <Badge variant="secondary">Calculated</Badge>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {rec.status === "calculated" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdatePayrollStatus(rec._id, "approved")}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs"
                                    >
                                      Approve
                                    </Button>
                                  )}
                                  {rec.status === "approved" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdatePayrollStatus(rec._id, "paid")}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Mark as Paid
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => downloadPayslipPDF(rec)}
                                    className="border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs gap-1"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Payslip
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: EMPLOYEE DIRECTORY */}
            <TabsContent value="employees" className="space-y-4">
              <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900">
                      Employee Directory ({employees.length})
                    </CardTitle>
                    <CardDescription>
                      Manage staff accounts, designations, departments, and base salary structures.
                    </CardDescription>
                  </div>

                  <Button
                    onClick={handleOpenAddEmployee}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Employee
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {employees.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 space-y-3">
                      <Users className="h-8 w-8 text-slate-400 mx-auto" />
                      <p className="font-semibold text-slate-900">No Employees Registered</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Add your staff profiles to enable automated monthly payroll processing.
                      </p>
                      <Button
                        onClick={handleOpenAddEmployee}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add First Employee
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3.5">Employee Name & ID</th>
                            <th className="px-6 py-3.5">Department & Designation</th>
                            <th className="px-6 py-3.5 text-right">Basic Salary</th>
                            <th className="px-6 py-3.5 text-right">Base Allowances</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-slate-800">
                          {employees.map((emp) => (
                            <tr key={emp._id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-900">{emp.name}</div>
                                <div className="text-xs font-mono text-slate-500">{emp.employeeId}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-slate-900">{emp.designation}</div>
                                <div className="text-xs text-slate-500">{emp.department}</div>
                              </td>
                              <td className="px-6 py-4 text-right font-semibold text-slate-900">
                                ₹{emp.basicSalary.toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4 text-right font-medium text-slate-600">
                                ₹{((emp.da || 0) + (emp.hra || 0) + (emp.travelAllowance || 0) + (emp.otherAllowance || 0)).toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4">
                                {emp.status === "active" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-none">Active</Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewEmployeeProfile(emp)}
                                    title="View Financial Profile"
                                    className="h-8 w-8 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEditEmployee(emp)}
                                    title="Edit Profile"
                                    className="h-8 w-8 text-slate-600 hover:bg-slate-100 rounded-lg"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeactivateEmployee(emp)}
                                    title="Deactivate Employee"
                                    className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-lg"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      {/* Add / Edit Employee Dialog Modal */}
      <Dialog open={isAddEmployeeModalOpen || isEditEmployeeModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddEmployeeModalOpen(false);
          setIsEditEmployeeModalOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmployee && isEditEmployeeModalOpen ? "Edit Employee Profile" : "Register New Employee"}</DialogTitle>
            <DialogDescription>
              Set up employee information and monthly base salary structure.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="empName">Full Name *</Label>
                <Input
                  id="empName"
                  placeholder="e.g. Rahul Sharma"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  required
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="employeeId">Employee ID *</Label>
                <Input
                  id="employeeId"
                  placeholder="EMP101"
                  value={empForm.employeeId}
                  onChange={(e) => setEmpForm({ ...empForm, employeeId: e.target.value })}
                  required
                  className="rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  placeholder="Engineering / Sales / HR"
                  value={empForm.department}
                  onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="designation">Designation / Role</Label>
                <Input
                  id="designation"
                  placeholder="Software Engineer"
                  value={empForm.designation}
                  onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-150 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="basicSalary">Monthly Basic Salary (₹) *</Label>
                <Input
                  id="basicSalary"
                  type="number"
                  placeholder="40000"
                  value={empForm.basicSalary}
                  onChange={(e) => setEmpForm({ ...empForm, basicSalary: e.target.value })}
                  required
                  className="rounded-xl font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hra">House Rent Allowance (HRA ₹)</Label>
                <Input
                  id="hra"
                  type="number"
                  placeholder="8000"
                  value={empForm.hra}
                  onChange={(e) => setEmpForm({ ...empForm, hra: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="da">Dearness Allowance (DA ₹)</Label>
                <Input
                  id="da"
                  type="number"
                  placeholder="4000"
                  value={empForm.da}
                  onChange={(e) => setEmpForm({ ...empForm, da: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="travelAllowance">Travel Allowance (₹)</Label>
                <Input
                  id="travelAllowance"
                  type="number"
                  placeholder="2000"
                  value={empForm.travelAllowance}
                  onChange={(e) => setEmpForm({ ...empForm, travelAllowance: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddEmployeeModalOpen(false);
                  setIsEditEmployeeModalOpen(false);
                }}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submittingEmployee}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2"
              >
                {submittingEmployee && <Loader2 className="h-4 w-4 animate-spin" />}
                {selectedEmployee && isEditEmployeeModalOpen ? "Save Changes" : "Create Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payroll;
