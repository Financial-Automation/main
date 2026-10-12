import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Download,
  Users,
  Building2,
  FileText,
  BookOpen,
  Loader2,
  ChevronRight,
  Sparkles,
  DollarSign,
  Clock,
  ExternalLink,
  RefreshCw,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import { DEFAULT_REPORT_COMPANY_NAME, getReportCompanyName } from "@/lib/reportBranding";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface MovementItem {
  id: string;
  type: "Sales Invoice" | "Purchase Bill" | "Payroll";
  referenceNo: string;
  partyName: string;
  amount: number;
  dueDate: string;
  status: "overdue" | "expected";
}

interface CashFlowPlanningData {
  planningWindowDays: number;
  openingCash: number;
  currentCash: number;
  actualMTD: {
    inflow: number;
    outflow: number;
    net: number;
  };
  expectedInflows: {
    totalInWindow: number;
    overdue: number;
    upcoming: number;
    count: number;
    items: MovementItem[];
  };
  expectedOutflows: {
    totalInWindow: number;
    overdue: number;
    upcoming: number;
    payroll: number;
    count: number;
    items: MovementItem[];
  };
  projectedClosingCash: number;
  potentialDeficit: number;
  riskStatus: {
    hasRisk: boolean;
    severity: "healthy" | "warning" | "danger";
    warningMessage: string;
    drivers: string[];
  };
}

export const CashFlow = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();

  const [windowDays, setWindowDays] = useState<number>(30);
  const [planningData, setPlanningData] = useState<CashFlowPlanningData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("all");

  const [predictData, setPredictData] = useState<any>(null);
  const [loadingPredict, setLoadingPredict] = useState<boolean>(false);

  useEffect(() => {
    fetchPlanningData();
  }, [windowDays]);

  const fetchPlanningData = async () => {
    try {
      setLoading(true);
      const data = await apiRequest(`${API_BASE_URL}/api/cashflow/planning?days=${windowDays}`);
      setPlanningData(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load cash flow planning data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPredictions = async () => {
    try {
      setLoadingPredict(true);
      const data = await apiRequest(`${API_BASE_URL}/api/cashflow/predict`);
      setPredictData(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load trend predictions.");
    } finally {
      setLoadingPredict(false);
    }
  };

  const downloadReport = () => {
    if (!planningData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(getReportCompanyName(DEFAULT_REPORT_COMPANY_NAME), pageWidth / 2, y, { align: "center" });

    y += 8;
    doc.setFontSize(18);
    doc.text(`CASH FLOW PLANNING CONTROL REPORT (${windowDays}-DAY WINDOW)`, pageWidth / 2, y, { align: "center" });

    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: "center" });

    y += 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE CASH SUMMARY", 15, y);

    y += 8;
    const summaryRows = [
      ["Current Cash Position", `Rs. ${planningData.currentCash.toLocaleString('en-IN')}`],
      [`Expected Inflows (Next ${windowDays} Days)`, `Rs. ${planningData.expectedInflows.totalInWindow.toLocaleString('en-IN')}`],
      [`Expected Outflows (Next ${windowDays} Days)`, `Rs. ${planningData.expectedOutflows.totalInWindow.toLocaleString('en-IN')}`],
      [`Projected Closing Cash`, `Rs. ${planningData.projectedClosingCash.toLocaleString('en-IN')}`],
      ["Potential Cash Deficit", planningData.potentialDeficit > 0 ? `Rs. ${planningData.potentialDeficit.toLocaleString('en-IN')}` : "None"],
      ["Risk Status", planningData.riskStatus.hasRisk ? "WARNING: Cash Shortage Risk" : "HEALTHY"]
    ];

    autoTable(doc, {
      startY: y,
      head: [["Financial Metric", "Value"]],
      body: summaryRows,
      theme: "grid"
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    // Upcoming Inflows Table
    doc.setFontSize(12);
    doc.text(`EXPECTED INFLOWS (${planningData.expectedInflows.items.length})`, 15, y);
    y += 8;

    const inflowRows = planningData.expectedInflows.items.map(item => [
      item.referenceNo,
      item.partyName,
      new Date(item.dueDate).toLocaleDateString(),
      item.status.toUpperCase(),
      `Rs. ${item.amount.toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Reference", "Customer", "Due Date", "Status", "Amount"]],
      body: inflowRows.length > 0 ? inflowRows : [["N/A", "No pending inflows", "-", "-", "Rs. 0"]],
      theme: "grid"
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    // Upcoming Outflows Table
    doc.setFontSize(12);
    doc.text(`EXPECTED OUTFLOWS (${planningData.expectedOutflows.items.length})`, 15, y);
    y += 8;

    const outflowRows = planningData.expectedOutflows.items.map(item => [
      item.referenceNo,
      item.partyName,
      new Date(item.dueDate).toLocaleDateString(),
      item.status.toUpperCase(),
      `Rs. ${item.amount.toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Reference", "Supplier / Type", "Due Date", "Status", "Amount"]],
      body: outflowRows.length > 0 ? outflowRows : [["N/A", "No pending outflows", "-", "-", "Rs. 0"]],
      theme: "grid"
    });

    doc.save(`cash_flow_plan_${windowDays}days_${Date.now()}.pdf`);
    toast.success("Cash flow planning report downloaded.");
  };

  // Combine Movements for Display
  const allMovements: (MovementItem & { category: "inflow" | "outflow" })[] = [];
  if (planningData) {
    planningData.expectedInflows.items.forEach(i => allMovements.push({ ...i, category: "inflow" }));
    planningData.expectedOutflows.items.forEach(o => allMovements.push({ ...o, category: "outflow" }));
    allMovements.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }

  const filteredMovements = allMovements.filter(m => {
    if (activeTab === "inflows") return m.category === "inflow";
    if (activeTab === "outflows") return m.category === "outflow";
    if (activeTab === "overdue") return m.status === "overdue";
    return true;
  });

  // Chart Visualization Data
  const chartData = planningData ? [
    { name: "Current Cash", amount: planningData.currentCash },
    { name: "Expected Inflows", amount: planningData.expectedInflows.totalInWindow },
    { name: "Expected Outflows", amount: -planningData.expectedOutflows.totalInWindow },
    { name: "Projected Closing", amount: planningData.projectedClosingCash }
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Page Header */}
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
              <BarChart3 className="h-7 w-7 text-indigo-600" />
              Cash Flow Planning & Financial Control Center
            </h1>
            <p className="text-sm text-slate-500">
              Trace current cash, expected inflows, vendor payables & 30/60/90-day cash shortage risks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* 30 / 60 / 90 Planning Window Buttons */}
          <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1">
            <Button
              variant={windowDays === 30 ? "default" : "ghost"}
              size="sm"
              onClick={() => setWindowDays(30)}
              className={windowDays === 30 ? "bg-indigo-600 text-white rounded-lg font-semibold" : "text-slate-700 hover:text-slate-900 rounded-lg"}
            >
              30 Days
            </Button>
            <Button
              variant={windowDays === 60 ? "default" : "ghost"}
              size="sm"
              onClick={() => setWindowDays(60)}
              className={windowDays === 60 ? "bg-indigo-600 text-white rounded-lg font-semibold" : "text-slate-700 hover:text-slate-900 rounded-lg"}
            >
              60 Days
            </Button>
            <Button
              variant={windowDays === 90 ? "default" : "ghost"}
              size="sm"
              onClick={() => setWindowDays(90)}
              className={windowDays === 90 ? "bg-indigo-600 text-white rounded-lg font-semibold" : "text-slate-700 hover:text-slate-900 rounded-lg"}
            >
              90 Days
            </Button>
          </div>

          <Button
            onClick={downloadReport}
            disabled={!planningData}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md gap-2"
          >
            <Download className="h-4 w-4" />
            Download Plan PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p>Analyzing cash flows, receivables & vendor payables...</p>
        </div>
      ) : planningData ? (
        <>
          {/* Financial Risk Warning Banner */}
          {planningData.riskStatus.hasRisk && (
            <Card className="rounded-2xl border-amber-300 bg-amber-50/90 shadow-sm overflow-hidden">
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-amber-900">
                      {planningData.riskStatus.warningMessage}
                    </h3>
                    {planningData.riskStatus.drivers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {planningData.riskStatus.drivers.map((driver, idx) => (
                          <Badge key={idx} variant="outline" className="bg-white/80 border-amber-300 text-amber-900 text-xs">
                            {driver}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                  <Button
                    onClick={() => navigate("/customers")}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs gap-1"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Review Receivables
                  </Button>
                  <Button
                    onClick={() => navigate("/vendors")}
                    size="sm"
                    variant="outline"
                    className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900 rounded-xl text-xs gap-1"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Review Payables
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4 Core Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Opening / Current Cash */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Cash Balance</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{planningData.currentCash.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Actual cash/bank on hand</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Expected Inflows */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Expected Inflows ({windowDays}D)
                  </p>
                  <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                    + ₹{planningData.expectedInflows.totalInWindow.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-amber-600 font-medium mt-0.5">
                    ₹{planningData.expectedInflows.overdue.toLocaleString('en-IN')} overdue
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Expected Outflows */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Expected Outflows ({windowDays}D)
                  </p>
                  <h3 className="text-2xl font-bold text-red-600 mt-1">
                    - ₹{planningData.expectedOutflows.totalInWindow.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Payables & payroll due
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Projected Closing Cash */}
            <Card className={`rounded-2xl shadow-sm bg-white border ${planningData.projectedClosingCash < 0 ? 'border-red-300' : 'border-slate-200'}`}>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Projected Closing ({windowDays}D)
                  </p>
                  <h3 className={`text-2xl font-bold mt-1 ${planningData.projectedClosingCash < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    ₹{planningData.projectedClosingCash.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {planningData.potentialDeficit > 0 ? `Deficit: ₹${planningData.potentialDeficit.toLocaleString('en-IN')}` : 'Healthy positive balance'}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${planningData.projectedClosingCash < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {planningData.projectedClosingCash < 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle className="h-6 w-6" />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Center Row */}
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                Financial Action Center: What Should You Do Today?
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                      <Users className="h-4 w-4" />
                      Follow Up Customer Receivables
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {planningData.expectedInflows.count} open customer invoice(s) due for collection.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/customers")}
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-xl text-xs w-full justify-between"
                  >
                    <span>View Customer Profiles</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
                      <Building2 className="h-4 w-4" />
                      Vendor Payables Schedule
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {planningData.expectedOutflows.count} supplier bill(s) pending payment.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/vendors")}
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-xl text-xs w-full justify-between"
                  >
                    <span>View Vendor Payables</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                      <FileText className="h-4 w-4" />
                      Invoice Management
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Create new invoices or record partial payments.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/invoice")}
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-xl text-xs w-full justify-between"
                  >
                    <span>Open Invoice Module</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                      <BookOpen className="h-4 w-4" />
                      Bookkeeping Audit
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Verify categorized expenses & cash entries.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/bookkeeping")}
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-xl text-xs w-full justify-between"
                  >
                    <span>Open Bookkeeping</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Tabbed Movements Timeline Table */}
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Upcoming Cash Movements Timeline ({filteredMovements.length})
                </CardTitle>
                <CardDescription>
                  Inflows & outflows due within the next {windowDays} days.
                </CardDescription>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                <TabsList className="rounded-xl bg-slate-200/80 p-1 grid grid-cols-4 w-full sm:w-80">
                  <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">All</TabsTrigger>
                  <TabsTrigger value="inflows" className="rounded-lg text-xs font-semibold">Inflows</TabsTrigger>
                  <TabsTrigger value="outflows" className="rounded-lg text-xs font-semibold">Outflows</TabsTrigger>
                  <TabsTrigger value="overdue" className="rounded-lg text-xs font-semibold">Overdue</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              {filteredMovements.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <Clock className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="font-semibold text-slate-900">No Cash Movements Found</p>
                  <p className="text-xs text-slate-500">No expected transactions for the selected filter and timeframe.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5">Type & Reference</th>
                        <th className="px-6 py-3.5">Party / Category</th>
                        <th className="px-6 py-3.5">Due Date</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Amount</th>
                        <th className="px-6 py-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-slate-800">
                      {filteredMovements.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{item.type}</div>
                            <div className="text-xs font-mono text-slate-500">{item.referenceNo}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900">{item.partyName}</div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">
                            {new Date(item.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-6 py-4">
                            {item.status === "overdue" ? (
                              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-none">
                                Overdue
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                Expected
                              </Badge>
                            )}
                          </td>
                          <td className={`px-6 py-4 text-right font-semibold ${item.category === 'inflow' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {item.category === 'inflow' ? '+' : '-'} ₹{item.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.category === 'inflow' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate("/customers")}
                                className="h-8 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg gap-1"
                              >
                                View Customer
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate("/vendors")}
                                className="h-8 text-xs text-amber-600 hover:bg-amber-50 rounded-lg gap-1"
                              >
                                View Vendor
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

    </div>
  );
};

export default CashFlow;
