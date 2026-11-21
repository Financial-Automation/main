/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Calculator, Sparkles, TrendingUp, Search, FileText, Database, BarChart3 } from "lucide-react";
import { DEFAULT_REPORT_COMPANY_NAME, REPORT_FOOTER_COMPANY, getReportCompanyName, formatPDFCurrency, formatPDFRatio } from "@/lib/reportBranding";
import { API_BASE_URL } from "@/lib/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FormData {
  companyName: string;
  currentAssets: string;
  currentLiabilities: string;
  totalAssets: string;
  totalLiabilities: string;
  equity: string;
  totalEquity: string;
  revenue: string;
  expenses: string;
  netIncome: string;
  totalDebt: string;
  sharesOutstanding: string;
  inventory: string;
}

interface RatioRecord {
  id: string;
  companyName: string;
  period: string;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  totalEquity: number;
  revenue: number;
  expenses: number;
  netIncome: number;
  totalDebt: number;
  sharesOutstanding: number;
  inventory: number;
  ratios: {
    currentRatio: number;
    debtToEquity: number;
    debtRatio: number;
    quickRatio: number;
    grossProfitMargin: number;
    netProfitMargin: number;
    roe: number;
    roa: number;
    assetsTurnover: number;
    eps: number;
  };
  createdAt: string;
}

const FinancialRatios = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("calculator");

  // Calculator State
  const [formData, setFormData] = useState<FormData>({
    companyName: DEFAULT_REPORT_COMPANY_NAME,
    currentAssets: "",
    currentLiabilities: "",
    totalAssets: "",
    totalLiabilities: "",
    equity: "",
    totalEquity: "",
    revenue: "",
    expenses: "",
    netIncome: "",
    totalDebt: "",
    sharesOutstanding: "",
    inventory: ""
  });

  // Results State
  const [calculatedRatios, setCalculatedRatios] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const autoGenerateRatios = async () => {
    setErrorMessage(null);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/financial-ratios/generate?companyName=${encodeURIComponent(formData.companyName)}&period=this-year`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        if (data.hasEnoughData === false || data.message === "Not enough data") {
          setErrorMessage("Not enough data");
          setCalculatedRatios(null);
          setShowResult(true);
          return;
        }

        setCalculatedRatios(data.ratios);
        setFormData({
          companyName: data.companyName,
          currentAssets: (data.currentAssets || 0).toString(),
          currentLiabilities: (data.currentLiabilities || 0).toString(),
          totalAssets: (data.totalAssets || 0).toString(),
          totalLiabilities: (data.totalLiabilities || 0).toString(),
          equity: (data.equity || 0).toString(),
          totalEquity: (data.totalEquity || 0).toString(),
          revenue: (data.revenue || 0).toString(),
          expenses: (data.expenses || 0).toString(),
          netIncome: (data.netIncome || 0).toString(),
          totalDebt: (data.totalDebt || 0).toString(),
          sharesOutstanding: (data.sharesOutstanding || 0).toString(),
          inventory: (data.inventory || 0).toString()
        });
        
        // Create new record
        const newRecord: RatioRecord = {
          id: Date.now().toString(),
          companyName: getReportCompanyName(data.companyName),
          period: data.period,
          currentAssets: data.currentAssets,
          currentLiabilities: data.currentLiabilities,
          totalAssets: data.totalAssets,
          totalLiabilities: data.totalLiabilities,
          equity: data.equity,
          totalEquity: data.totalEquity,
          revenue: data.revenue,
          expenses: data.expenses,
          netIncome: data.netIncome,
          totalDebt: data.totalDebt,
          sharesOutstanding: data.sharesOutstanding,
          inventory: data.inventory,
          ratios: data.ratios,
          createdAt: new Date().toLocaleDateString()
        };

        setRatiosHistory(prev => [newRecord, ...prev]);
        setFilteredHistory(prev => [newRecord, ...prev]);
        setShowResult(true);
      } else {
        alert(data.message || "Failed to generate dynamic ratios");
      }
    } catch (error) {
      console.error("Error auto-generating ratios:", error);
      alert("Connection error. Failed to generate ratios.");
    }
  };

  // History State
  const [searchTerm, setSearchTerm] = useState("");
  const [ratiosHistory, setRatiosHistory] = useState<RatioRecord[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<RatioRecord[]>([]);

  // Initialize with sample data
  useEffect(() => {
    const sampleData: RatioRecord[] = [
      {
        id: "1",
        companyName: "Tech Corp Inc",
        period: "Q4 2024",
        currentAssets: 500000,
        currentLiabilities: 250000,
        totalAssets: 2000000,
        totalLiabilities: 800000,
        equity: 1200000,
        totalEquity: 1200000,
        revenue: 1500000,
        expenses: 900000,
        netIncome: 300000,
        totalDebt: 600000,
        sharesOutstanding: 100000,
        inventory: 100000,
        ratios: {
          currentRatio: 2.0,
          debtToEquity: 0.5,
          debtRatio: 0.3,
          quickRatio: 1.6,
          grossProfitMargin: 40.0,
          netProfitMargin: 20.0,
          roe: 25.0,
          roa: 15.0,
          assetsTurnover: 0.75,
          eps: 3.0
        },
        createdAt: "2024-01-15"
      },
      {
        id: "2",
        companyName: "Global Enterprises",
        period: "Q4 2024",
        currentAssets: 800000,
        currentLiabilities: 400000,
        totalAssets: 3500000,
        totalLiabilities: 1500000,
        equity: 2000000,
        totalEquity: 2000000,
        revenue: 2800000,
        expenses: 1960000,
        netIncome: 420000,
        totalDebt: 1200000,
        sharesOutstanding: 150000,
        inventory: 200000,
        ratios: {
          currentRatio: 2.0,
          debtToEquity: 0.6,
          debtRatio: 0.34,
          quickRatio: 1.5,
          grossProfitMargin: 30.0,
          netProfitMargin: 15.0,
          roe: 21.0,
          roa: 12.0,
          assetsTurnover: 0.8,
          eps: 2.8
        },
        createdAt: "2024-01-14"
      }
    ];

    setRatiosHistory(sampleData);
    setFilteredHistory(sampleData);
  }, []);

  // Function to update form inputs
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Function to calculate ratios
  const calculateRatios = () => {
    const currentAssets = parseFloat(formData.currentAssets) || 0;
    const currentLiabilities = parseFloat(formData.currentLiabilities) || 0;
    const totalAssets = parseFloat(formData.totalAssets) || 0;
    const totalLiabilities = parseFloat(formData.totalLiabilities) || 0;
    const equity = parseFloat(formData.equity) || 0;
    const totalEquity = parseFloat(formData.totalEquity) || 0;
    const revenue = parseFloat(formData.revenue) || 0;
    const expenses = parseFloat(formData.expenses) || 0;
    const netIncome = parseFloat(formData.netIncome) || 0;
    const totalDebt = parseFloat(formData.totalDebt) || 0;
    const sharesOutstanding = parseFloat(formData.sharesOutstanding) || 0;
    const inventory = parseFloat(formData.inventory) || 0;

    // Calculate ratios
    const ratios = {
      currentRatio: currentLiabilities ? currentAssets / currentLiabilities : 0,
      debtToEquity: totalEquity ? totalDebt / totalEquity : 0,
      debtRatio: totalAssets ? totalDebt / totalAssets : 0,
      quickRatio: currentLiabilities ? (currentAssets - inventory) / currentLiabilities : 0,
      grossProfitMargin: revenue ? ((revenue - expenses) / revenue) * 100 : 0,
      netProfitMargin: revenue ? (netIncome / revenue) * 100 : 0,
      roe: totalEquity ? (netIncome / totalEquity) * 100 : 0,
      roa: totalAssets ? (netIncome / totalAssets) * 100 : 0,
      assetsTurnover: totalAssets ? revenue / totalAssets : 0,
      eps: sharesOutstanding ? netIncome / sharesOutstanding : 0,
    };

    setCalculatedRatios(ratios);
    setShowResult(true);

    // Create new record
    const newRecord: RatioRecord = {
      id: Date.now().toString(),
      companyName: getReportCompanyName(formData.companyName),
      period: new Date().toLocaleDateString(),
      currentAssets,
      currentLiabilities,
      totalAssets,
      totalLiabilities,
      equity,
      totalEquity,
      revenue,
      expenses,
      netIncome,
      totalDebt,
      sharesOutstanding,
      inventory,
      ratios,
      createdAt: new Date().toLocaleDateString()
    };

    // Add to history
    setRatiosHistory(prev => [newRecord, ...prev]);
    setFilteredHistory(prev => [newRecord, ...prev]);
  };

  // Search function
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setFilteredHistory(ratiosHistory);
      return;
    }

    const filtered = ratiosHistory.filter(
      (record) =>
        record.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.period?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredHistory(filtered);
  };

  // Reset search when search term is cleared
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredHistory(ratiosHistory);
    }
  }, [searchTerm, ratiosHistory]);

  const downloadReport = (record: RatioRecord) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const company = getReportCompanyName(record.companyName);

    // Header Branding
    doc.setFillColor(15, 23, 42); // dark indigo / slate-950
    doc.rect(0, 0, 210, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("FINANCIAL RATIOS ANALYSIS REPORT", 14, 12);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Company: ${company} | Period: ${record.period || "Current"}`, 14, 20);

    // Report Metadata Table
    autoTable(doc, {
      startY: 32,
      head: [["Metric Category", "Centralized Input Value (INR)"]],
      body: [
        ["Current Assets", formatPDFCurrency(record.currentAssets || 0)],
        ["Current Liabilities", formatPDFCurrency(record.currentLiabilities || 0)],
        ["Total Assets", formatPDFCurrency(record.totalAssets || 0)],
        ["Total Liabilities", formatPDFCurrency(record.totalLiabilities || 0)],
        ["Total Equity", formatPDFCurrency(record.totalEquity || 0)],
        ["Total Revenue", formatPDFCurrency(record.revenue || 0)],
        ["Net Income / Profit", formatPDFCurrency(record.netIncome || 0)],
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });

    const ratios = record.ratios || {};
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 100;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("CALCULATED FINANCIAL RATIOS", 14, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      head: [["Ratio Name", "Formula / Indicator", "Calculated Value", "Status Benchmark"]],
      body: [
        ["Current Ratio", "Current Assets / Current Liabilities", formatPDFRatio(ratios.currentRatio), ratios.currentRatio >= 1.5 ? "Good (> 1.5)" : "Watch (< 1.5)"],
        ["Quick Ratio", "(Current Assets - Inventory) / Liabilities", formatPDFRatio(ratios.quickRatio), ratios.quickRatio >= 1.0 ? "Good (> 1.0)" : "Watch (< 1.0)"],
        ["Debt-to-Equity", "Total Debt / Total Equity", formatPDFRatio(ratios.debtToEquity), ratios.debtToEquity <= 1.5 ? "Good (<= 1.5)" : "High Debt"],
        ["Debt Ratio", "Total Debt / Total Assets", formatPDFRatio(ratios.debtRatio), ratios.debtRatio <= 0.5 ? "Good (<= 0.5)" : "Moderate/High"],
        ["Gross Profit Margin", "(Revenue - COGS) / Revenue", formatPDFRatio(ratios.grossProfitMargin, "%"), ratios.grossProfitMargin >= 20 ? "Good (>= 20%)" : "Low"],
        ["Net Profit Margin", "Net Income / Revenue", formatPDFRatio(ratios.netProfitMargin, "%"), ratios.netProfitMargin >= 10 ? "Good (>= 10%)" : "Low"],
        ["Return on Equity (ROE)", "Net Income / Total Equity", formatPDFRatio(ratios.roe, "%"), ratios.roe >= 15 ? "Strong (>= 15%)" : "Moderate"],
        ["Return on Assets (ROA)", "Net Income / Total Assets", formatPDFRatio(ratios.roa, "%"), ratios.roa >= 5 ? "Strong (>= 5%)" : "Moderate"],
        ["Asset Turnover Ratio", "Revenue / Total Assets", formatPDFRatio(ratios.assetsTurnover), ratios.assetsTurnover >= 0.5 ? "Healthy" : "Low Turnover"],
      ],
      theme: "grid",
      headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated from Centralized Accounting System | ${REPORT_FOOTER_COMPANY} | Page ${i} of ${pageCount}`,
        14,
        287
      );
    }

    doc.save(`Financial_Ratios_${company.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
  };

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  const getRatioColor = (value: number, type: string) => {
    switch (type) {
      case 'currentRatio':
        return value > 2 ? 'text-green-400' : value > 1 ? 'text-yellow-400' : 'text-red-400';
      case 'debtToEquity':
        return value < 0.5 ? 'text-green-400' : value < 1 ? 'text-yellow-400' : 'text-red-400';
      case 'profitMargin':
        return value > 20 ? 'text-green-400' : value > 10 ? 'text-yellow-400' : 'text-red-400';
      case 'roe':
        return value > 15 ? 'text-green-400' : value > 8 ? 'text-yellow-400' : 'text-red-400';
      default:
        return 'text-blue-400';
    }
  };

  return (
    <div className="liquid-page module-ink min-h-screen overflow-hidden text-slate-950">
      <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Button
            variant="ghost"
            onClick={handleBackToDashboard}
            className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-4">
            <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
              <TrendingUp className="h-8 w-8 text-slate-900" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Financial Ratios Studio
              </h1>
              <p className="mt-1 text-slate-600">Liquidity, solvency, and profitability at a glance</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 rounded-[24px] border border-white/55 bg-white/42 p-1 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
            <TabsTrigger
              value="calculator"
              className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
            >
              <Calculator className="h-4 w-4" />
              Calculator
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
            >
              <FileText className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500">
              <div className="absolute left-1/2 top-0 h-32 w-96 -translate-x-1/2 bg-gradient-to-b from-sky-200/60 to-transparent blur-2xl" />

              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-slate-950">
                      <BarChart3 className="h-7 w-7 text-sky-700 transition-transform duration-300" />
                      Ratio Calculator
                    </CardTitle>
                    <CardDescription className="mt-2 text-base text-slate-600">
                      Enter financial data to calculate performance ratios and save the result.
                    </CardDescription>
                  </div>
                  <div className="hidden rounded-full border border-white/60 bg-white/60 px-4 py-2 shadow-sm backdrop-blur-xl sm:block">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-sm font-semibold text-slate-700">Live Analysis</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-8 p-8">
                <div className="space-y-3 group">
                  <Label htmlFor="companyName" className="text-blue-100 font-bold">Enter Your Company Name</Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Enter your company name"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange("companyName", e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0 transition-all duration-300"
                  />
                </div>

                {/* Financial Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { id: "currentAssets", label: "Current Assets", icon: "💰" },
                    { id: "currentLiabilities", label: "Current Liabilities", icon: "📊" },
                    { id: "totalAssets", label: "Total Assets", icon: "🏦" },
                    { id: "totalLiabilities", label: "Total Liabilities", icon: "📉" },
                    { id: "equity", label: "Equity", icon: "⚖️" },
                    { id: "totalEquity", label: "Total Equity", icon: "📈" },
                    { id: "revenue", label: "Revenue", icon: "💸" },
                    { id: "expenses", label: "Expenses", icon: "💳" },
                    { id: "netIncome", label: "Net Income", icon: "🎯" },
                    { id: "totalDebt", label: "Total Debt", icon: "🏷️" },
                    { id: "sharesOutstanding", label: "Shares Outstanding", icon: "📊" },
                    { id: "inventory", label: "Inventory", icon: "📦" }
                  ].map((field) => (
                    <div key={field.id} className="space-y-3 group">
                      <Label htmlFor={field.id} className="text-blue-100 font-bold flex items-center gap-2">
                        <span>{field.icon}</span>
                        {field.label} (₹)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={field.id}
                          type="number"
                          placeholder="0.00"
                          value={formData[field.id as keyof FormData]}
                          onChange={(e) => handleInputChange(field.id as keyof FormData, e.target.value)}
                          className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0 transition-all duration-300"
                        />
                        <VoiceButton
                          onTranscript={(text) => handleInputChange(field.id as keyof FormData, text)}
                          onClear={() => handleInputChange(field.id as keyof FormData, "")}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Calculate Button */}
                <div className="flex flex-col md:flex-row gap-4 pt-4">
                  <Button
                    onClick={autoGenerateRatios}
                    className="h-14 flex-1 rounded-full bg-indigo-900 text-lg font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-800"
                  >
                    <Sparkles className="mr-2 h-5 w-5 text-yellow-300" />
                    Auto-Generate from Live Data
                  </Button>
                  <Button
                    onClick={calculateRatios}
                    className="h-14 flex-1 rounded-full bg-slate-950 text-lg font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    <Calculator className="mr-2 h-5 w-5" />
                    Calculate (Manual)
                  </Button>
                </div>

                {/* Display Results */}
                {showResult && errorMessage === "Not enough data" && (
                  <Card className="liquid-panel relative overflow-hidden rounded-[36px] border-rose-400/50 p-8 bg-rose-50/10 text-center animate-in fade-in duration-700">
                    <p className="text-xl text-rose-400 font-semibold mb-2">Not enough data</p>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      There is no Balance Sheet record available to compute financial ratios. Please generate a Balance Sheet first to populate current assets, liabilities, and equity values.
                    </p>
                  </Card>
                )}

                {showResult && calculatedRatios && (
                  <Card className="liquid-panel relative overflow-hidden rounded-[36px] border-white/55 animate-in fade-in duration-700">
                    <div className="absolute left-0 right-0 top-0 h-1 animate-pulse bg-gradient-to-r from-transparent via-sky-400 to-transparent" />

                    <div className="absolute top-4 right-4 px-3 py-1 bg-gradient-to-r from-yellow-400/30 to-amber-400/30 rounded-full backdrop-blur-md border border-yellow-400/50 flex items-center gap-1 shadow-lg shadow-yellow-400/30">
                      <Sparkles className="h-3 w-3 text-yellow-300" />
                      <span className="text-xs text-yellow-100 font-bold">Calculated</span>
                    </div>

                    <CardContent className="pt-12 pb-12 px-8 text-center relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 blur-2xl" />

                      <div className="relative z-10">
                        <p className="text-xl text-cyan-300 mb-8 font-semibold tracking-wide uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                          Financial Ratios Analysis
                        </p>

                        {/* Ratios Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                          {Object.entries(calculatedRatios).map(([key, value]) => (
                            <div key={key} className="p-4 bg-white/5 rounded-2xl border border-blue-400/20 hover:border-cyan-400/40 transition-all duration-300">
                              <p className="text-sm text-blue-300 mb-2 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                              </p>
                              <p className={`text-2xl font-bold ${getRatioColor(value as number, key)}`}>
                                {typeof value === 'number' ? (value as number).toFixed(2) : value}
                                {key.includes('Margin') || key.includes('roe') || key.includes('roa') ? '%' : ''}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 justify-center">
                          <Button
                            onClick={() => {
                              const currentRecord: RatioRecord = {
                                id: Date.now().toString(),
                                companyName: getReportCompanyName(formData.companyName),
                                period: new Date().toLocaleDateString(),
                                currentAssets: parseFloat(formData.currentAssets) || 0,
                                currentLiabilities: parseFloat(formData.currentLiabilities) || 0,
                                totalAssets: parseFloat(formData.totalAssets) || 0,
                                totalLiabilities: parseFloat(formData.totalLiabilities) || 0,
                                equity: parseFloat(formData.equity) || 0,
                                totalEquity: parseFloat(formData.totalEquity) || 0,
                                revenue: parseFloat(formData.revenue) || 0,
                                expenses: parseFloat(formData.expenses) || 0,
                                netIncome: parseFloat(formData.netIncome) || 0,
                                totalDebt: parseFloat(formData.totalDebt) || 0,
                                sharesOutstanding: parseFloat(formData.sharesOutstanding) || 0,
                                inventory: parseFloat(formData.inventory) || 0,
                                ratios: calculatedRatios,
                                createdAt: new Date().toLocaleDateString()
                              };
                              downloadReport(currentRecord);
                            }}
                            className="px-8 py-4 h-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-lg font-bold rounded-2xl shadow-2xl shadow-cyan-500/50 transition-all duration-300 hover:scale-105 border border-cyan-400/30 group"
                          >
                            <Download className="mr-2 h-5 w-5 group-hover:translate-y-1 transition-transform duration-300" />
                            Download Report
                          </Button>
                          <Button
                            onClick={() => setActiveTab("history")}
                            variant="outline"
                            className="px-8 py-4 h-auto border-2 border-cyan-400/40 hover:bg-cyan-400/10 text-cyan-300 text-lg font-bold rounded-2xl transition-all duration-300 hover:scale-105"
                          >
                            View in History
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            {/* Search Section */}
            <Card
              className="mb-8 backdrop-blur-2xl bg-white/10 border border-blue-400/30 rounded-3xl shadow-2xl shadow-blue-500/30 transition-all duration-500"
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-cyan-400" />
                  <CardTitle className="text-2xl font-bold text-blue-100">Analysis History</CardTitle>
                </div>
                <CardDescription className="text-blue-300/70">
                  {ratiosHistory.length} analysis{ratiosHistory.length !== 1 ? 's' : ''} in history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-400/60" />
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Search by company name or period..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-12 h-12 bg-white/5 backdrop-blur-xl text-blue-100 border-blue-400/30 focus:border-cyan-400/50 rounded-2xl placeholder:text-blue-400/40 focus:ring-2 focus:ring-cyan-400/30 transition-all duration-300"
                      />
                      <VoiceButton
                        onTranscript={(text) => setSearchTerm(text)}
                        onClear={() => setSearchTerm("")}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSearch}
                    className="h-12 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/40 transition-all duration-300"
                  >
                    <Search className="mr-2 h-5 w-5" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Records List */}
            {filteredHistory.length > 0 ? (
              <div className="grid gap-6">
                {filteredHistory.map((record, index) => (
                  <Card
                    key={record.id}
                    className="backdrop-blur-2xl bg-white/5 border border-blue-400/20 rounded-3xl shadow-2xl shadow-blue-500/20 transition-all duration-500 group relative overflow-hidden"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <CardContent className="pt-6 relative z-10">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-bold text-xl text-blue-100 transition-colors duration-300">
                              {record.companyName}
                            </h3>
                            <Badge
                              variant="outline"
                              className="border-blue-400/40 text-blue-300 backdrop-blur-xl bg-blue-500/10 px-3 py-1 rounded-xl font-semibold transition-all duration-300"
                            >
                              {record.period}
                            </Badge>
                            <Badge className="bg-gradient-to-r from-green-500/80 to-emerald-500/80 text-white border-0 px-3 py-1 rounded-xl font-semibold shadow-lg shadow-green-500/30 flex items-center gap-1 transition-all duration-300">
                              <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                              {record.createdAt === new Date().toLocaleDateString() ? 'Today' : 'Saved'}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-blue-300/80 flex items-center gap-2 transition-colors duration-300">
                              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full transition-shadow duration-300" />
                              Date: {record.createdAt} | Revenue: ₹{record.revenue.toLocaleString()} | Net Income: ₹{record.netIncome.toLocaleString()}
                            </p>

                            {/* Key Ratios Display */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                              <div className="text-center p-3 bg-white/5 rounded-xl border border-blue-400/20 transition-colors duration-300">
                                <p className="text-xs text-blue-300 mb-1">Current Ratio</p>
                                <p className={`text-lg font-bold ${getRatioColor(record.ratios.currentRatio, 'currentRatio')}`}>
                                  {record.ratios.currentRatio.toFixed(2)}
                                </p>
                              </div>
                              <div className="text-center p-3 bg-white/5 rounded-xl border border-blue-400/20 transition-colors duration-300">
                                <p className="text-xs text-blue-300 mb-1">ROE</p>
                                <p className={`text-lg font-bold ${getRatioColor(record.ratios.roe, 'roe')}`}>
                                  {record.ratios.roe.toFixed(2)}%
                                </p>
                              </div>
                              <div className="text-center p-3 bg-white/5 rounded-xl border border-blue-400/20 transition-colors duration-300">
                                <p className="text-xs text-blue-300 mb-1">Net Margin</p>
                                <p className={`text-lg font-bold ${getRatioColor(record.ratios.netProfitMargin, 'profitMargin')}`}>
                                  {record.ratios.netProfitMargin.toFixed(2)}%
                                </p>
                              </div>
                              <div className="text-center p-3 bg-white/5 rounded-xl border border-blue-400/20 transition-colors duration-300">
                                <p className="text-xs text-blue-300 mb-1">EPS</p>
                                <p className="text-lg font-bold text-cyan-300">
                                  ₹{record.ratios.eps.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          onClick={() => downloadReport(record)}
                          className="text-blue-200 border-2 border-blue-400/40 hover:bg-gradient-to-r hover:from-blue-600/80 hover:to-cyan-600/80 hover:border-cyan-400/60 hover:text-white backdrop-blur-xl bg-white/5 rounded-2xl px-6 py-6 font-bold shadow-lg transition-all duration-300 group/btn"
                        >
                          <Download className="mr-2 h-5 w-5 group-hover/btn:animate-bounce" />
                          Download Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card
                className="backdrop-blur-2xl bg-white/5 border border-blue-400/20 rounded-3xl shadow-2xl shadow-blue-500/30"
              >
                <CardContent className="pt-6 text-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-6 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-xl border border-blue-400/30 shadow-lg shadow-blue-500/40">
                      <Database className="h-12 w-12 text-blue-300 animate-pulse" />
                    </div>
                    <p className="text-blue-300/80 text-lg font-medium">No financial analysis records found.</p>
                    <p className="text-blue-400/60 text-sm">Try adjusting your search terms or make a new analysis</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center pb-8">
          <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40">
            Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
          </p>
        </div>
      </main>
    </div>
  );
};

export default FinancialRatios;
