import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { ArrowLeft, Download, Calculator, Sparkles, Receipt, Shield, TrendingUp, Search, Database, FileText, BarChart2, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DEFAULT_REPORT_COMPANY_NAME, REPORT_FOOTER_COMPANY, getReportCompanyName, formatPDFCurrency } from "@/lib/reportBranding";

interface Results {
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  type: string;
}

interface TaxReturn {
  _id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  transactionType: string;
  gstRate: number;
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  createdAt: string;
}

const TaxGST = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("analytics");
  const [companyName, setCompanyName] = useState(DEFAULT_REPORT_COMPANY_NAME);

  // GST Analytics State
  const [analyticsPeriod, setAnalyticsPeriod] = useState("this-month");
  const [gstAnalytics, setGstAnalytics] = useState<any>(null);

  // Calculator State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [transactionType, setTransactionType] = useState("intrastate");
  const [results, setResults] = useState<Results | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Returns State
  const [searchTerm, setSearchTerm] = useState("");
  const [returns, setReturns] = useState<TaxReturn[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<TaxReturn[]>([]);

  // Fetch GST analytics from backend
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_ENDPOINTS.TAX}/analytics?period=${analyticsPeriod}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          setGstAnalytics(data);
        }
      } catch (err) {
        console.error("Error fetching GST analytics:", err);
      }
    };
    fetchAnalytics();
  }, [analyticsPeriod]);

  // Generate next sequential GST invoice number
  const generateGSTInvoiceNo = (currentReturns: TaxReturn[]) => {
    const prefix = 'GST';
    let next = 1;

    if (currentReturns && currentReturns.length > 0) {
      const matchingNos = currentReturns
        .filter(ret => ret.invoiceNumber && ret.invoiceNumber.startsWith(`${prefix}-`))
        .map(ret => {
          const parts = ret.invoiceNumber!.split('-');
          const numStr = parts[parts.length - 1];
          const num = parseInt(numStr, 10);
          return isNaN(num) ? 0 : num;
        });

      if (matchingNos.length > 0) {
        next = Math.max(...matchingNos) + 1;
      }
    }
    return `${prefix}-${String(next).padStart(5, '0')}`;
  };

  // Fetch GST data from backend
  useEffect(() => {
    const fetchReturns = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_ENDPOINTS.TAX}/all`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await response.json();
        setReturns(data);
        setFilteredReturns(data);
        setInvoiceNumber(generateGSTInvoiceNo(data));
      } catch (error) {
        console.error("Error fetching GST data:", error);
      }
    };
    fetchReturns();
  }, []);

  // Calculator Functions
  const calculateGST = async () => {
    const baseAmount = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) / 100;

    let cgst = 0, sgst = 0, igst = 0, total = 0, typeLabel = "";

    if (transactionType === "intrastate") {
      cgst = baseAmount * (rate / 2);
      sgst = baseAmount * (rate / 2);
      total = baseAmount + cgst + sgst;
      typeLabel = "Intrastate (CGST + SGST)";
    } else {
      igst = baseAmount * rate;
      total = baseAmount + igst;
      typeLabel = "Interstate (IGST)";
    }

    const result: Results = { baseAmount, cgst, sgst, igst, total, type: typeLabel };
    setResults(result);
    setShowResult(true);

    const taxData = {
      invoiceNumber,
      invoiceDate,
      baseAmount,
      gstRate: parseFloat(gstRate),
      transactionType,
      cgst,
      sgst,
      igst,
      total,
    };

    try {
      const res = await fetch(`${API_ENDPOINTS.TAX}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taxData),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Error saving data:", data);
      } else {
        // Refresh returns data after successful save
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_ENDPOINTS.TAX}/all`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const newData = await response.json();
        setReturns(newData);
        setFilteredReturns(newData);
        setInvoiceNumber(generateGSTInvoiceNo(newData));
        toast({
          title: "Success",
          description: "GST return entry saved successfully!",
        });
      }
    } catch (error) {
      console.error("Error connecting to backend:", error);
    }
  };

  // Returns Functions
  const handleSearch = () => {
    const filtered = returns.filter(
      (ret) =>
        ret.transactionType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.gstRate?.toString().includes(searchTerm)
    );
    setFilteredReturns(filtered);
  };

  const getInvoiceNumber = (ret: TaxReturn, index?: number) =>
    ret.invoiceNumber || `GST-${new Date(ret.createdAt).getFullYear()}-${String(index !== undefined ? index + 1 : 1).padStart(4, "0")}`;

  const getInvoiceDate = (ret: TaxReturn) =>
    new Date(ret.invoiceDate || ret.createdAt).toLocaleDateString('en-IN');

  const downloadTaxReport = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 18;

    if (filteredReturns.length === 0) {
      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(getReportCompanyName(companyName), pageW / 2, 10, { align: "center" });
      doc.setFontSize(16);
      doc.text("GST TAX RETURN SUMMARY REPORT", pageW / 2, 20, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text("No GST tax return records found for the selected period.", pageW / 2, 50, { align: "center" });

      doc.setFontSize(8);
      doc.text(`Generated by ${REPORT_FOOTER_COMPANY} | Page 1 of 1`, pageW / 2, pageH - 12, { align: "center" });
      doc.save(`tax_gst_report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({
        title: "Download Complete",
        description: "GST Tax report PDF generated successfully!",
      });
      return;
    }

    const addReportFooter = () => {
      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        const footerY = pageH - 12;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, footerY - 5, margin + contentW, footerY - 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generated by ${REPORT_FOOTER_COMPANY}  |  GST Compliance Engine`, pageW / 2, footerY, { align: "center" });
        doc.text(`Page ${page} of ${totalPages}`, pageW - margin, footerY, { align: "right" });
      }
    };

    // Header block
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(getReportCompanyName(companyName), pageW / 2, 10, { align: "center" });
    doc.setFontSize(16);
    doc.text("GST TAX RETURN SUMMARY REPORT", pageW / 2, 20, { align: "center" });
    y = 36;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW / 2, y, { align: "center" });
    y += 10;

    const reportRows = filteredReturns.map((ret, index) => [
      (index + 1).toString(),
      getInvoiceNumber(ret, index),
      getInvoiceDate(ret),
      ret.transactionType === "intrastate" ? "Intrastate" : "Interstate",
      `${ret.gstRate}%`,
      formatPDFCurrency(ret.baseAmount),
      formatPDFCurrency(ret.cgst || 0),
      formatPDFCurrency(ret.sgst || 0),
      formatPDFCurrency(ret.igst || 0),
      formatPDFCurrency((ret.cgst || 0) + (ret.sgst || 0) + (ret.igst || 0)),
      formatPDFCurrency(ret.total)
    ]);

    autoTable(doc, {
      startY: y,
      head: [["S.No", "Invoice Number", "Invoice Date", "Type", "GST Rate", "Base Amount", "CGST", "SGST", "IGST", "Tax Collected", "Total Amount"]],
      body: reportRows,
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175] },
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin, bottom: 24 },
      pageBreak: "auto",
      rowPageBreak: "avoid"
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    const totalBase = filteredReturns.reduce((sum, ret) => sum + (Number(ret.baseAmount) || 0), 0);
    const totalCgst = filteredReturns.reduce((sum, ret) => sum + (Number(ret.cgst) || 0), 0);
    const totalSgst = filteredReturns.reduce((sum, ret) => sum + (Number(ret.sgst) || 0), 0);
    const totalIgst = filteredReturns.reduce((sum, ret) => sum + (Number(ret.igst) || 0), 0);
    const totalTax = filteredReturns.reduce((sum, ret) => sum + (Number(ret.cgst || 0) + Number(ret.sgst || 0) + Number(ret.igst || 0)), 0);
    const grandTotal = filteredReturns.reduce((sum, ret) => sum + (Number(ret.total) || 0), 0);

    if (y > pageH - 82) {
      doc.addPage();
      y = 22;
    }

    // Summary Card
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, contentW, 46, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Total Base Amount: ${formatPDFCurrency(totalBase)}`, margin + 6, y + 8);
    doc.text(`Total Tax Collected: ${formatPDFCurrency(totalTax)}`, margin + 6, y + 16);
    doc.text(`CGST: ${formatPDFCurrency(totalCgst)}`, margin + 6, y + 24);
    doc.text(`SGST: ${formatPDFCurrency(totalSgst)}`, margin + 6, y + 32);
    doc.text(`IGST: ${formatPDFCurrency(totalIgst)}`, margin + 6, y + 40);
    doc.setTextColor(147, 197, 253);
    doc.text(`Grand Total: ${formatPDFCurrency(grandTotal)}`, margin + contentW - 6, y + 40, { align: "right" });
    addReportFooter();

    doc.save(`tax_gst_report_${new Date().toISOString().split('T')[0]}.pdf`);
    toast({
      title: "Download Complete",
      description: "GST Tax report PDF downloaded successfully!",
    });
  };

  const downloadPDF = (ret: TaxReturn) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 18;

    // Header block
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(getReportCompanyName(companyName), pageW / 2, 10, { align: "center" });
    doc.setFontSize(16);
    doc.text("GST TAX RETURN", pageW / 2, 20, { align: "center" });
    y = 36;

    // Subtitle / Period
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Transaction Type: ${ret.transactionType === "intrastate" ? "Intrastate (CGST + SGST)" : "Interstate (IGST)"}`, pageW / 2, y, { align: "center" });
    y += 5;
    doc.text(`Date: ${new Date(ret.createdAt).toLocaleDateString('en-IN')}`, pageW / 2, y, { align: "center" });
    y += 10;

    // Details Table
    const tableRows = [
      ["Invoice Number", getInvoiceNumber(ret)],
      ["Invoice Date", getInvoiceDate(ret)],
      ["Base Amount", `Rs. ${ret.baseAmount.toFixed(2)}`],
      ["GST Rate", `${ret.gstRate}%`]
    ];

    if (ret.cgst > 0) {
      tableRows.push(["CGST", `Rs. ${ret.cgst.toFixed(2)}`]);
      tableRows.push(["SGST", `Rs. ${ret.sgst.toFixed(2)}`]);
    } else if (ret.igst > 0) {
      tableRows.push(["IGST", `Rs. ${ret.igst.toFixed(2)}`]);
    }

    autoTable(doc, {
      startY: y,
      head: [["Detail Column", "Value"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175] },
      margin: { left: margin, right: margin },
      foot: [["Total Amount with GST", `Rs. ${ret.total.toFixed(2)}`]],
      footStyles: { fillColor: [240, 253, 244], textColor: [21, 128, 61], fontStyle: "bold" }
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    // Status box
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, y, contentW, 18, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(22, 163, 74);
    doc.text("TAX RECORDED SUCCESSFULLY", pageW / 2, y + 7, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("This transaction has been successfully logged for GST return filing.", pageW / 2, y + 13, { align: "center" });
    y += 26;

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentW, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated by ${REPORT_FOOTER_COMPANY}  |  GST Compliance Engine`,
      pageW / 2,
      y,
      { align: "center" }
    );

    doc.save(`GST_Return_${ret.transactionType}_${Date.now()}.pdf`);
    toast({
      title: "Download Complete",
      description: "GST Return PDF downloaded successfully!",
    });
  };

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <div className="liquid-page min-h-screen overflow-hidden text-slate-950">
      <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={handleBackToDashboard}
              className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>

            <Button
              onClick={downloadTaxReport}
              className="group rounded-full bg-slate-950 font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <Download className="mr-2 h-5 w-5 group-hover:translate-y-1 transition-transform duration-300" />
              Download Report
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
              <Receipt className="h-8 w-8 text-slate-900" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Tax & GST Studio
              </h1>
              <p className="mt-1 text-slate-600">Calculate, manage, and track GST transactions</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Section with Tabs */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Card className="liquid-panel mb-8 rounded-[28px] border-white/55 bg-white/40">
          <CardContent className="p-5">
            <div className="space-y-2">
              <Label htmlFor="companyName">Enter Your Company Name</Label>
              <Input
                id="companyName"
                placeholder="Enter your company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 rounded-[24px] border border-white/55 bg-white/42 p-1 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
            >
              <BarChart2 className="h-4 w-4" />
              GST Analytics
            </TabsTrigger>
            <TabsTrigger
              value="calculator"
              className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
            >
              <Calculator className="h-4 w-4" />
              GST Calculator
            </TabsTrigger>
            <TabsTrigger
              value="returns"
              className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
            >
              <FileText className="h-4 w-4" />
              Tax Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500">
              <CardHeader className="relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-bold text-slate-950 flex items-center gap-2">
                      <BarChart2 className="h-6 w-6 text-sky-700" />
                      Live GST & Tax Summary
                    </CardTitle>
                    <CardDescription className="text-slate-600 mt-1">
                      Automated Output vs Input Tax reconciliation from sales and purchase transactions
                    </CardDescription>
                  </div>
                  <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
                    <SelectTrigger className="w-[180px] h-12 rounded-full border-slate-200 bg-white/80 text-slate-900 font-semibold focus:ring-0">
                      <SelectValue placeholder="Select Period" />
                    </SelectTrigger>
                    <SelectContent className="rounded-[18px]">
                      <SelectItem value="this-month">This Month</SelectItem>
                      <SelectItem value="last-month">Last Month</SelectItem>
                      <SelectItem value="this-quarter">This Quarter</SelectItem>
                      <SelectItem value="this-year">This Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-8 p-8">
                {/* GST SUMMARY CARDS */}
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-sky-700" />
                    GST Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-5 rounded-2xl bg-white/80 border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Output GST (Sales)</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">
                        ₹{(gstAnalytics?.gstSummary?.outputGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-white/80 border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Input GST (Purchases)</p>
                      <p className="text-2xl font-black text-slate-900 mt-2">
                        ₹{(gstAnalytics?.gstSummary?.inputGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 shadow-sm">
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Net GST Payable</p>
                      <p className="text-2xl font-black text-emerald-950 mt-2">
                        ₹{(gstAnalytics?.gstSummary?.gstPayable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-sky-50/80 border border-sky-200 shadow-sm">
                      <p className="text-xs font-bold text-sky-800 uppercase tracking-wider">Net GST Receivable</p>
                      <p className="text-2xl font-black text-sky-950 mt-2">
                        ₹{(gstAnalytics?.gstSummary?.gstReceivable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* TAX BREAKDOWN */}
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-sky-700" />
                    Tax Breakdown (CGST / SGST / IGST)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-2xl bg-white/80 border border-slate-200 shadow-sm space-y-3">
                      <p className="text-base font-bold text-slate-900 flex justify-between border-b pb-2">
                        <span>CGST</span>
                        <span className="text-sky-700">₹{(gstAnalytics?.taxBreakdown?.cgst?.net || 0).toFixed(2)} Net</span>
                      </p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Output CGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.cgst?.output || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Input CGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.cgst?.input || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-white/80 border border-slate-200 shadow-sm space-y-3">
                      <p className="text-base font-bold text-slate-900 flex justify-between border-b pb-2">
                        <span>SGST</span>
                        <span className="text-sky-700">₹{(gstAnalytics?.taxBreakdown?.sgst?.net || 0).toFixed(2)} Net</span>
                      </p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Output SGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.sgst?.output || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Input SGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.sgst?.input || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-white/80 border border-slate-200 shadow-sm space-y-3">
                      <p className="text-base font-bold text-slate-900 flex justify-between border-b pb-2">
                        <span>IGST</span>
                        <span className="text-sky-700">₹{(gstAnalytics?.taxBreakdown?.igst?.net || 0).toFixed(2)} Net</span>
                      </p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Output IGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.igst?.output || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Input IGST</span>
                        <span className="font-semibold text-slate-800">₹{(gstAnalytics?.taxBreakdown?.igst?.input || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRANSACTION SUMMARY */}
                <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-xl space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-sky-400" />
                    Transaction Base Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Taxable Sales Subtotal</p>
                      <p className="text-xl font-bold text-white mt-1">₹{(gstAnalytics?.transactionSummary?.taxableSales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Taxable Purchases Subtotal</p>
                      <p className="text-xl font-bold text-white mt-1">₹{(gstAnalytics?.transactionSummary?.taxablePurchases || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Total Sales GST</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">₹{(gstAnalytics?.transactionSummary?.salesGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Total Purchase GST</p>
                      <p className="text-xl font-bold text-sky-400 mt-1">₹{(gstAnalytics?.transactionSummary?.purchaseGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calculator">
            <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500">
              <div className="absolute left-1/2 top-0 h-32 w-96 -translate-x-1/2 bg-gradient-to-b from-sky-200/60 to-transparent blur-2xl" />

              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-slate-950">
                      <Calculator className="h-7 w-7 text-sky-700 hover:rotate-12 transition-transform duration-300" />
                      GST Calculator
                    </CardTitle>
                    <CardDescription className="mt-2 text-base text-slate-600">
                      Enter transaction details to calculate and save applicable taxes
                    </CardDescription>
                  </div>
                  <div className="hidden rounded-full border border-white/60 bg-white/60 px-4 py-2 shadow-sm backdrop-blur-xl sm:block">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-semibold text-slate-700">Live System</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-8 p-8">
                {/* Invoice Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="invoiceNumber" className="font-semibold text-slate-700">Invoice Number</Label>
                    <Input
                      id="invoiceNumber"
                      type="text"
                      placeholder="e.g., GST-2026-0001"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0 transition-all duration-300"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="invoiceDate" className="font-semibold text-slate-700">Invoice Date</Label>
                    <Input
                      id="invoiceDate"
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300 focus:ring-0 transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Base Amount Input */}
                <div className="space-y-3 group">
                  <Label htmlFor="amount" className="font-semibold text-slate-700 text-lg flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-700" />
                    Base Amount (₹)
                  </Label>
                  <div className="relative flex items-center gap-2">
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Enter transaction amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0 transition-all duration-300"
                    />
                    <VoiceButton
                      onTranscript={(text) => setAmount(text)}
                      onClear={() => setAmount("")}
                      language="en-US"
                      size="md"
                    />
                  </div>
                  <p className="text-slate-500 text-sm pl-1">
                    💡 Enter the base amount before tax calculation or click the mic to speak
                  </p>
                </div>

                {/* GST Rate and Transaction Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* GST Rate */}
                  <div className="space-y-3 group">
                    <Label htmlFor="gstRate" className="font-semibold text-slate-700 flex items-center gap-2">
                      <span>📊</span>
                      GST Rate (%)
                    </Label>
                    <Select value={gstRate} onValueChange={setGstRate}>
                      <SelectTrigger className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus-visible:ring-0 focus:ring-0 transition-all duration-300">
                        <SelectValue placeholder="Select GST rate" />
                      </SelectTrigger>
                      <SelectContent className="rounded-[18px] border-slate-200 bg-white text-slate-950">
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Transaction Type */}
                  <div className="space-y-3 group">
                    <Label htmlFor="transactionType" className="font-semibold text-slate-700 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-sky-700" />
                      Transaction Type
                    </Label>
                    <Select value={transactionType} onValueChange={setTransactionType}>
                      <SelectTrigger className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus-visible:ring-0 focus:ring-0 transition-all duration-300">
                        <SelectValue placeholder="Select transaction type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-[18px] border-slate-200 bg-white text-slate-950">
                        <SelectItem value="intrastate">
                          Intrastate (CGST + SGST)
                        </SelectItem>
                        <SelectItem value="interstate">
                          Interstate (IGST)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Calculate Button */}
                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={calculateGST}
                    className="h-14 flex-1 rounded-full bg-slate-950 text-lg font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    <Calculator className="mr-2 h-5 w-5" />
                    Calculate & Save GST
                  </Button>
                </div>

                {/* Results Display */}
                {showResult && results && (
                  <Card className="liquid-panel relative overflow-hidden rounded-[36px] border-white/55 animate-in fade-in duration-700">
                    <div className="absolute left-0 right-0 top-0 h-1 animate-pulse bg-gradient-to-r from-transparent via-sky-400 to-transparent" />

                    <div className="absolute top-4 right-4 px-3 py-1 bg-gradient-to-r from-yellow-400/30 to-amber-400/30 rounded-full backdrop-blur-md border border-yellow-400/50 flex items-center gap-1 shadow-lg shadow-yellow-400/30">
                      <TrendingUp className="h-3 w-3 text-slate-700" />
                      <span className="text-xs text-slate-700 font-bold">Calculated</span>
                    </div>

                    <CardHeader className="relative">
                      <CardTitle className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-950">
                        <Receipt className="h-6 w-6 text-sky-700" />
                        Tax Summary - {results.type}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4 p-8 relative">
                      <div className="relative z-10 space-y-3">
                        {/* Base Amount */}
                        <div className="flex justify-between items-center p-4 rounded-xl backdrop-blur-md bg-slate-50 border border-slate-200 hover:bg-white hover:scale-[1.02] transition-all duration-300">
                          <span className="text-slate-800 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 bg-sky-600 rounded-full" />
                            Base Amount
                          </span>
                          <span className="font-bold text-slate-900 text-lg">₹{results.baseAmount.toFixed(2)}</span>
                        </div>

                        {/* CGST and SGST (Intrastate) */}
                        {results.cgst > 0 && (
                          <>
                            <div className="flex justify-between items-center p-4 rounded-xl backdrop-blur-md bg-slate-50 border border-slate-200 hover:bg-white hover:scale-[1.02] transition-all duration-300">
                              <span className="text-slate-800 font-medium flex items-center gap-2">
                                <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                                CGST ({parseFloat(gstRate) / 2}%)
                              </span>
                              <span className="font-bold text-slate-900 text-lg">₹{results.cgst.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center p-4 rounded-xl backdrop-blur-md bg-slate-50 border border-slate-200 hover:bg-white hover:scale-[1.02] transition-all duration-300">
                              <span className="text-slate-800 font-medium flex items-center gap-2">
                                <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                                SGST ({parseFloat(gstRate) / 2}%)
                              </span>
                              <span className="font-bold text-slate-900 text-lg">₹{results.sgst.toFixed(2)}</span>
                            </div>
                          </>
                        )}

                        {/* IGST (Interstate) */}
                        {results.igst > 0 && (
                          <div className="flex justify-between items-center p-4 rounded-xl backdrop-blur-md bg-slate-50 border border-slate-200 hover:bg-white hover:scale-[1.02] transition-all duration-300">
                            <span className="text-slate-800 font-medium flex items-center gap-2">
                              <span className="w-2 h-2 bg-sky-600 rounded-full animate-pulse" />
                              IGST ({gstRate}%)
                            </span>
                            <span className="font-bold text-slate-900 text-lg">₹{results.igst.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Total Amount - Highlighted */}
                        <div className="flex justify-between items-center p-6 rounded-2xl backdrop-blur-xl bg-slate-950 border-2 border-slate-900 shadow-2xl mt-6">
                          <span className="text-xl font-black text-white drop-shadow-lg">Total Amount</span>
                          <span className="text-4xl font-black text-white drop-shadow-[0_0_30px_rgba(6,182,212,0.9)] animate-pulse">
                            ₹{results.total.toFixed(2)}
                          </span>
                        </div>

                        <p className="text-center text-sm text-slate-500 mt-4 flex items-center justify-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Tax breakdown saved to database
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="returns">
            {/* Search Section */}
            <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-sky-700" />
                      <CardTitle className="text-2xl font-bold text-slate-950">Search GST Records</CardTitle>
                    </div>
                    <CardDescription className="text-slate-600 mt-2">Filter records by transaction type or GST rate</CardDescription>
                  </div>
                  <Button
                    onClick={downloadTaxReport}
                    className="group rounded-full bg-slate-950 font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    <Download className="mr-2 h-4 w-4 group-hover:translate-y-1 transition-transform duration-300" />
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder="Search by transaction type or GST rate..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-12 h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:ring-0 focus-visible:ring-0 transition-all duration-300"
                    />
                  </div>
                  <Button
                    onClick={handleSearch}
                    className="h-12 px-6 rounded-full bg-slate-950 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.14)] hover:bg-slate-800 transition-all duration-300"
                  >
                    <Search className="mr-2 h-5 w-5" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Records List */}
            {filteredReturns.length > 0 ? (
              <div className="grid gap-6">
                {filteredReturns.map((ret, index) => (
                  <Card
                    key={ret._id}
                    className="liquid-panel overflow-hidden rounded-[28px] border-white/55 transition-all duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <CardContent className="pt-6 relative z-10">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-bold text-xl text-slate-900 transition-colors duration-300">
                              {ret.transactionType === "intrastate"
                                ? "Intrastate (CGST + SGST)"
                                : "Interstate (IGST)"}
                            </h3>
                            <Badge
                              variant="outline"
                              className="border-slate-300 text-slate-700 bg-slate-50 px-3 py-1 rounded-xl font-semibold"
                            >
                              {ret.transactionType}
                            </Badge>
                            <Badge className="bg-emerald-500 text-white border-0 px-3 py-1 rounded-xl font-semibold shadow-lg shadow-green-500/30 flex items-center gap-1">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                              Saved
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-slate-500 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
                              Date: {new Date(ret.createdAt).toLocaleDateString()}
                            </p>

                            <p className="text-base font-bold text-slate-800">
                              Base Amount: <span className="text-sky-700">₹{ret.baseAmount?.toLocaleString() || '0'}</span>
                            </p>

                            {(ret.cgst || 0) > 0 && (
                              <div className="space-y-1 pl-4 border-l-2 border-slate-300">
                                <p className="text-sm text-slate-600">CGST: ₹{(ret.cgst || 0).toFixed(2)}</p>
                                <p className="text-sm text-slate-600">SGST: ₹{(ret.sgst || 0).toFixed(2)}</p>
                              </div>
                            )}

                            {(ret.igst || 0) > 0 && (
                              <p className="text-sm text-slate-600 pl-4 border-l-2 border-slate-300">
                                IGST: ₹{(ret.igst || 0).toFixed(2)}
                              </p>
                            )}

                            <p className="text-lg font-black text-slate-900">
                              Total with GST: ₹{(ret.total || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          onClick={() => downloadPDF(ret)}
                          className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950 shadow-sm"
                        >
                          <Download className="mr-2 h-5 w-5" />
                          Download PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55">
                <CardContent className="pt-6 text-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
                      <Sparkles className="h-12 w-12 text-slate-900 animate-pulse" />
                    </div>
                    <p className="text-slate-800 text-lg font-medium">No GST data found yet.</p>
                    <p className="text-slate-500 text-sm">Start by adding some transactions to see them here</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

      </main>

      <div className="mt-8 text-center">
        <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40 bg-white/30">
          Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
        </p>
      </div>
    </div>
  );
};

export default TaxGST;
