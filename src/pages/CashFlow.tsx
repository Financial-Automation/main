/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS, API_BASE_URL } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, BarChart3, Sparkles, Download, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { DEFAULT_REPORT_COMPANY_NAME, REPORT_FOOTER_COMPANY, getReportCompanyName } from "@/lib/reportBranding";

interface CashFlowEntry {
  year: string;
  month: string;
  cashInflow: number;
  cashOutflow: number;
  netCashFlow: number;
  time: number;
}

interface PredictionData {
  month: string;
  predictedNetCashFlow: number;
  time: number;
}

const CashFlow = () => {
  const navigate = useNavigate();
  const chartRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    companyName: DEFAULT_REPORT_COMPANY_NAME,
    year: "",
    month: "",
    cashInflow: "",
    cashOutflow: "",
  });

  const [cashflowData, setCashflowData] = useState<CashFlowEntry[]>([]);
  const [predictions, setPredictions] = useState<PredictionData[]>([]);
  const [showPrediction, setShowPrediction] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addEntry = () => {
    if (!formData.year || !formData.month || !formData.cashInflow || !formData.cashOutflow) {
      alert("Please fill all fields!");
      return;
    }

    const months = formData.month.split(',').map(m => m.trim());
    const inflows = formData.cashInflow.split(',').map(val => parseFloat(val.trim()) || 0);
    const outflows = formData.cashOutflow.split(',').map(val => parseFloat(val.trim()) || 0);

    if (months.length !== inflows.length || months.length !== outflows.length) {
      alert("Number of months, cash inflows, and cash outflows must match!");
      return;
    }

    const newEntries: CashFlowEntry[] = months.map((month, index) => ({
      year: formData.year,
      month: month,
      cashInflow: inflows[index],
      cashOutflow: outflows[index],
      netCashFlow: inflows[index] - outflows[index],
      time: cashflowData.length + index,
    }));

    setCashflowData((prev) => [...prev, ...newEntries]);
    setFormData((prev) => ({ ...prev, year: "", month: "", cashInflow: "", cashOutflow: "" }));
    setShowPrediction(false);
  };

  const predictCashflow = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/cashflow/predict`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.hasEnoughData && data.predictions) {
          const futurePredictions: PredictionData[] = data.predictions.map((p: any) => ({
            month: p.month,
            predictedNetCashFlow: p.predictedNet,
            time: p.time
          }));
          setPredictions(futurePredictions);
          setShowPrediction(true);
          return;
        } else {
          alert(data.message || "Not enough historical data for reliable prediction");
          setShowPrediction(false);
          return;
        }
      }
    } catch (e) {
      console.error("Error fetching prediction from backend:", e);
    }

    if (cashflowData.length < 2) {
      alert("Not enough historical data for reliable prediction");
      return;
    }

    const n = cashflowData.length;
    const sumX = cashflowData.reduce((sum, entry) => sum + entry.time, 0);
    const sumY = cashflowData.reduce((sum, entry) => sum + entry.netCashFlow, 0);
    const sumXY = cashflowData.reduce((sum, entry) => sum + entry.time * entry.netCashFlow, 0);
    const sumXX = cashflowData.reduce((sum, entry) => sum + entry.time * entry.time, 0);

    const slope = (n * sumXY - sumX * sumY) / ((n * sumXX - sumX * sumX) || 1);
    const intercept = (sumY - slope * sumX) / n;

    const futurePredictions: PredictionData[] = [];
    for (let i = 0; i < 6; i++) {
      const futureTime = n + i;
      const predictedValue = slope * futureTime + intercept;
      futurePredictions.push({
        month: `Month ${futureTime + 1}`,
        predictedNetCashFlow: predictedValue,
        time: futureTime,
      });
    }

    setPredictions(futurePredictions);
    setShowPrediction(true);
  };

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  const downloadReport = async () => {
    if (cashflowData.length === 0) {
      alert("No data to download! Please add entries first.");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(getReportCompanyName(formData.companyName), pageWidth / 2, yPosition, { align: "center" });

    yPosition += 8;
    doc.setFontSize(18);
    doc.text("CASH FLOW ANALYSIS & PREDICTION REPORT", pageWidth / 2, yPosition, { align: "center" });

    yPosition += 15;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: "center" });

    yPosition += 15;

    if (chartRef.current) {
      try {
        const canvas = await html2canvas(chartRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = pageWidth - 30;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        doc.addImage(imgData, "PNG", 15, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 15;

        if (yPosition > pageHeight - 60) {
          doc.addPage();
          yPosition = 20;
        }
      } catch (error) {
        console.error("Error capturing chart:", error);
      }
    }

    doc.setFontSize(12);
    doc.text("HISTORICAL CASH FLOW DATA", 15, yPosition);

    yPosition += 10;
    const historicalData = cashflowData.map((entry, index) => [
      index + 1,
      `${entry.month} ${entry.year}`,
      `Rs. ${entry.cashInflow.toFixed(2)}`,
      `Rs. ${entry.cashOutflow.toFixed(2)}`,
      `Rs. ${entry.netCashFlow.toFixed(2)}`,
      entry.netCashFlow >= 0 ? "Positive" : "Negative"
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["#", "Period", "Cash Inflow", "Cash Outflow", "Net Cash Flow", "Status"]],
      body: historicalData,
      theme: "grid",
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.text("SUMMARY STATISTICS", 15, yPosition);
    yPosition += 8;

    const totalInflow = cashflowData.reduce((sum, e) => sum + e.cashInflow, 0);
    const totalOutflow = cashflowData.reduce((sum, e) => sum + e.cashOutflow, 0);
    const totalNetCashFlow = cashflowData.reduce((sum, e) => sum + e.netCashFlow, 0);
    const averageNetCashFlow = totalNetCashFlow / cashflowData.length;

    const summaryData = [
      ["Total Entries", cashflowData.length.toString()],
      ["Total Cash Inflow", `Rs. ${totalInflow.toFixed(2)}`],
      ["Total Cash Outflow", `Rs. ${totalOutflow.toFixed(2)}`],
      ["Total Net Cash Flow", `Rs. ${totalNetCashFlow.toFixed(2)}`],
      ["Average Net Cash Flow", `Rs. ${averageNetCashFlow.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: "grid",
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    if (predictions.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.text("AI-POWERED PREDICTIONS (Next 6 Months)", 15, yPosition);
      yPosition += 8;

      const predictionData = predictions.map((pred, index) => [
        index + 1,
        pred.month,
        `Rs. ${pred.predictedNetCashFlow.toFixed(2)}`,
        pred.predictedNetCashFlow >= 0 ? "Positive" : "Negative"
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [["#", "Month", "Predicted Net Cash Flow", "Status"]],
        body: predictionData,
        theme: "grid",
      });
    }

    const footerY = pageHeight - 12;
    doc.setDrawColor(226, 232, 240);
    doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated by ${REPORT_FOOTER_COMPANY}  |  Cash Flow Analytics Engine`, pageWidth / 2, footerY, { align: "center" });

    doc.save(`cashflow_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const chartData = [
    ...cashflowData.map((entry) => ({
      name: entry.month,
      actual: entry.netCashFlow,
      time: entry.time,
    })),
    ...predictions.map((pred) => ({
      name: pred.month,
      predicted: pred.predictedNetCashFlow,
      time: pred.time,
    })),
  ];

  return (
    <div className="liquid-page module-ink min-h-screen overflow-hidden text-slate-950">
      <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={handleBackToDashboard}
              className="rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>

            <Button
              onClick={downloadReport}
              className="group rounded-full bg-slate-950 font-semibold text-white shadow-[0_20px_48px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <Download className="mr-2 h-5 w-5 group-hover:translate-y-1 transition-transform duration-300" />
              Download Report
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
              <BarChart3 className="h-8 w-8 text-slate-900" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Cash Flow Forecast
              </h1>
              <p className="mt-1 text-slate-600">Forecast inflow and outflow with six-month clarity</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-950">
                <LineChartIcon className="h-6 w-6 text-sky-700" />
                Cash Flow Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="font-semibold text-slate-700">Enter Your Company Name</Label>
                <Input
                  placeholder="Enter your company name"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                />
              </div>

              <div className="space-y-3">
                <Label className="font-semibold text-slate-700">Year</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g., 2025"
                    value={formData.year}
                    onChange={(e) => handleInputChange("year", e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                  />
                  <VoiceButton
                    onTranscript={(text) => handleInputChange("year", text)}
                    onClear={() => handleInputChange("year", "")}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold text-slate-700">Month</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g., Jan,Feb,Mar"
                    value={formData.month}
                    onChange={(e) => handleInputChange("month", e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                  />
                  <VoiceButton
                    onTranscript={(text) => handleInputChange("month", text)}
                    onClear={() => handleInputChange("month", "")}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold text-slate-700">Cash Inflow (₹)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g., 5000,4800,5100"
                    value={formData.cashInflow}
                    onChange={(e) => handleInputChange("cashInflow", e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                  />
                  <VoiceButton
                    onTranscript={(text) => handleInputChange("cashInflow", text)}
                    onClear={() => handleInputChange("cashInflow", "")}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold text-slate-700">Cash Outflow (₹)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g., 7000,6500,5900"
                    value={formData.cashOutflow}
                    onChange={(e) => handleInputChange("cashOutflow", e.target.value)}
                    className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                  />
                  <VoiceButton
                    onTranscript={(text) => handleInputChange("cashOutflow", text)}
                    onClear={() => handleInputChange("cashOutflow", "")}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={addEntry} className="flex-1 h-12 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-2xl transition-all duration-300">
                  <Plus className="mr-2 h-5 w-5" /> Add Entry
                </Button>
                <Button onClick={predictCashflow} className="flex-1 h-12 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-2xl transition-all duration-300">
                  <BarChart3 className="mr-2 h-5 w-5" /> Predict
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-2xl bg-white/10 border border-blue-400/20 shadow-2xl rounded-3xl p-6 max-h-[500px] overflow-y-auto">
            <h3 className="text-2xl font-black text-blue-100 mb-4">Current Entries ({cashflowData.length})</h3>
            {cashflowData.length === 0 ? (
              <p className="text-blue-300/60 text-center py-8">No entries yet.</p>
            ) : (
              <div className="space-y-3">
                {cashflowData.map((entry, index) => (
                  <div key={index} className="bg-white/5 border border-blue-400/20 rounded-xl p-4">
                    <div className="flex justify-between font-bold text-cyan-400 mb-1">
                      <span>{entry.month} {entry.year}</span>
                      <span className={entry.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}>₹{entry.netCashFlow.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {showPrediction && predictions.length > 0 && (
          <Card className="mt-8 backdrop-blur-2xl bg-gradient-to-br from-slate-800/90 via-blue-900/80 to-indigo-900/90 border-2 border-cyan-400/60 shadow-2xl rounded-3xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-black text-blue-100">AI Prediction Results</h3>
              <div className="px-4 py-2 bg-yellow-400/20 border border-yellow-400/50 rounded-full text-yellow-100 font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Powered
              </div>
            </div>
            <div ref={chartRef} className="bg-white rounded-xl p-4">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="actual" stroke="#06b6d4" strokeWidth={3} name="Actual" />
                  <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={3} strokeDasharray="5 5" name="Predicted" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <div className="mt-8 text-center pb-8">
            <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40">
                Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
            </p>
        </div>
      </main>
    </div>
  );
};

export default CashFlow;
