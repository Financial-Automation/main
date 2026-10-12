import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    FileText,
    Printer,
    Download,
    AlertCircle,
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { API_BASE_URL } from "@/lib/api";

interface PurchaseItem {
    itemName: string;
    itemCode?: string;
    codeType?: "HSN" | "SAC";
    hsnCode?: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    taxPercent: number;
    taxAmount: number;
    sgstRate: number;
    sgstAmount: number;
    cgstRate: number;
    cgstAmount: number;
    igstRate: number;
    igstAmount: number;
    isInterState: boolean;
    amount: number;
    description?: string;
}

interface PurchaseInvoiceData {
    _id: string;
    customerType?: "B2B" | "B2C";
    customerName?: string;
    customerPhone?: string;
    customerGstin?: string;
    partyName?: string;
    supplierName: string;
    phone: string;
    gstin: string;
    billNo: string;
    billDate: string;
    bankName?: string;
    accountType?: string;
    accountNumber?: string;
    ifscCode?: string;
    paymentMethod?: "Cash" | "Credit" | "G Pay" | "Net Banking";
    invoiceSize?: "A4" | "A5";
    invoiceFormat?: "Supermarket" | "Hotel" | "Stationery Shop";
    stateOfSupply: string;
    businessState: string;
    items: PurchaseItem[];
    subtotal: number;
    totalSgst: number;
    totalCgst: number;
    totalIgst: number;
    totalTax: number;
    total: number;
    paid: number;
    balance: number;
    templateSnapshot?: any;
    createdAt: string;
}

const PublicPurchaseInvoiceView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState<PurchaseInvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/purchase-invoice/public/${id}`);
                if (!response.ok) {
                    throw new Error("Purchase invoice not found or could not be loaded");
                }
                const data = await response.json();
                setInvoice(data);
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError("An unknown error occurred");
                }
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchInvoice();
    }, [id]);

    useEffect(() => {
        if (invoice && !loading) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('print') === 'true') {
                const timer = setTimeout(() => {
                    window.print();
                }, 600);
                return () => clearTimeout(timer);
            } else if (params.get('download') === 'true') {
                const timer = setTimeout(() => {
                    handleDownloadPDF();
                }, 800);
                return () => clearTimeout(timer);
            }
        }
    }, [invoice, loading]);

    const handleDownloadPDF = async () => {
        const element = document.getElementById("purchase-a4-preview");
        if (!element || downloading) return;
        try {
            setDownloading(true);
            window.scrollTo(0, 0);
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                width: element.scrollWidth,
                height: element.scrollHeight,
                windowWidth: document.documentElement.offsetWidth
            });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, "PNG", 0, position, imgWidth, Math.min(imgHeight, pageHeight));
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`Purchase_Invoice_${invoice?.billNo || "Details"}.pdf`);
        } catch (err) {
            console.error("PDF generation failed, falling back to print window", err);
            window.print();
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-amber-200 font-medium">Loading Purchase Invoice...</p>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-3xl p-8 text-center">
                    <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Invoice Not Found</h1>
                    <p className="text-slate-400 mb-6">{error || "The purchase invoice you're looking for doesn't exist or the link is invalid."}</p>
                    <button
                        onClick={() => navigate("/")}
                        className="w-full py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-medium transition-all"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    const invoiceSize = invoice.invoiceSize || "A4";
    const invoicePaperClass = invoiceSize === "A5" ? "max-w-[720px]" : "max-w-4xl";
    const customerDisplayName = invoice.customerName || invoice.partyName || "SHREE ANDAL TRADERS";

    // Safe fallback template configuration
    const initialConfig = {
        header: {
            showLogo: true,
            logoPosition: "left" as const,
            logoSize: "medium" as const,
            logoUrl: "",
            headerTitle: "TAX INVOICE / PURCHASE BILL",
            showCompanyName: true,
            showAddress: true,
            showPhone: true,
            showEmail: true
        },
        supplier: {
            showName: true,
            showPhone: true,
            showEmail: true,
            showGSTIN: true,
            showAddress: true
        },
        customer: {
            showName: true,
            showGSTIN: true,
            showPhone: true,
            showEmail: true,
            showBillingAddress: true,
            showShippingAddress: true,
            showPlaceOfSupply: true
        },
        invoiceInfo: {
            showInvoiceNumber: true,
            showInvoiceDate: true,
            showDueDate: true,
            showPaymentTerms: true,
            showOrderNumber: true,
            showSalesperson: true,
            labels: {
                invoiceNumber: "Bill No.",
                invoiceDate: "Bill Date",
                dueDate: "Due Date",
                paymentTerms: "Payment Terms",
                orderNumber: "Order No.",
                salespersonName: "Salesperson"
            }
        },
        items: {
            columns: ["item", "description", "hsn", "quantity", "rate", "tax", "amount"],
            labels: {
                item: "Item",
                description: "Description",
                sku: "SKU",
                hsn: "HSN/SAC",
                quantity: "Qty",
                rate: "Price/Unit",
                tax: "Tax",
                amount: "Amount"
            }
        },
        tax: {
            showSummary: true,
            showCGST: true,
            showSGST: true,
            showIGST: true,
            showTaxableAmount: true,
            showTotalTax: true
        },
        banking: {
            show: true,
            label: "Banking Details"
        },
        payment: {
            showPaidAmount: true,
            showBalance: true,
            showPaymentMethod: true
        },
        notes: {
            show: true,
            label: "Purchase Notes",
            defaultText: "Goods received in good condition."
        },
        terms: {
            show: true,
            label: "Terms & Conditions",
            defaultText: "Payment terms as per vendor agreement."
        },
        signature: {
            show: true,
            name: "Authorized Signatory",
            designation: "Store Manager",
            imageUrl: ""
        },
        footer: {
            show: true,
            text: "Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨"
        },
        design: {
            primaryColor: "#d97706",
            secondaryColor: "#fffbeb",
            textColor: "#0f172a",
            backgroundColor: "#ffffff",
            borderColor: "#cbd5e1",
            fontFamily: "Inter",
            fontSize: 12,
            headingSize: 18,
            bodySize: 12,
            borderStyle: "light" as const,
            cornerRadius: 8,
            invoiceSize: "A4" as const,
            invoiceFormat: "Supermarket" as const
        },
        sectionsOrder: [
            "header",
            "supplier",
            "customer",
            "invoiceInfo",
            "items",
            "tax",
            "payment",
            "banking",
            "notes",
            "terms",
            "signature",
            "footer"
        ]
    };

    const config = {
        ...initialConfig,
        ...(invoice.templateSnapshot || {}),
        header: { ...initialConfig.header, ...(invoice.templateSnapshot?.header || {}) },
        supplier: { ...initialConfig.supplier, ...(invoice.templateSnapshot?.supplier || {}) },
        customer: { ...initialConfig.customer, ...(invoice.templateSnapshot?.customer || {}) },
        invoiceInfo: { 
            ...initialConfig.invoiceInfo, 
            ...(invoice.templateSnapshot?.invoiceInfo || {}),
            labels: { ...initialConfig.invoiceInfo.labels, ...(invoice.templateSnapshot?.invoiceInfo?.labels || {}) }
        },
        items: { 
            ...initialConfig.items, 
            ...(invoice.templateSnapshot?.items || {}),
            labels: { ...initialConfig.items.labels, ...(invoice.templateSnapshot?.items?.labels || {}) }
        },
        tax: { ...initialConfig.tax, ...(invoice.templateSnapshot?.tax || {}) },
        banking: {
            ...initialConfig.banking,
            ...(invoice.templateSnapshot?.banking || {}),
            show: invoice.templateSnapshot?.banking?.show !== undefined ? invoice.templateSnapshot?.banking?.show : true,
            label: invoice.templateSnapshot?.banking?.label || "Banking Details"
        },
        payment: { ...initialConfig.payment, ...(invoice.templateSnapshot?.payment || {}) },
        notes: { ...initialConfig.notes, ...(invoice.templateSnapshot?.notes || {}) },
        terms: { ...initialConfig.terms, ...(invoice.templateSnapshot?.terms || {}) },
        signature: {
            ...initialConfig.signature,
            ...(invoice.templateSnapshot?.signature || {}),
            show: invoice.templateSnapshot?.signature?.show !== undefined ? invoice.templateSnapshot?.signature?.show : true
        },
        footer: { ...initialConfig.footer, ...(invoice.templateSnapshot?.footer || {}) },
        design: { ...initialConfig.design, ...(invoice.templateSnapshot?.design || {}) },
        sectionsOrder: invoice.templateSnapshot?.sectionsOrder || initialConfig.sectionsOrder
    };

    const fontFamily = config.design.fontFamily;
    const subtotal = invoice.subtotal || invoice.items.reduce((acc, i) => acc + (i.amount || 0), 0);
    const cgst = invoice.totalCgst || 0;
    const sgst = invoice.totalSgst || 0;
    const igst = invoice.totalIgst || 0;
    const totalTax = invoice.totalTax || (cgst + sgst + igst);
    const grandTotal = invoice.total || (subtotal + totalTax);
    const paid = invoice.paid || 0;
    const balance = invoice.balance !== undefined ? invoice.balance : Math.max(0, grandTotal - paid);

    return (
        <>
            <style>{`
                /* Screen view overrides for clean print preview */
                #purchase-a4-preview {
                    background: white !important;
                    color: #0f172a !important;
                }
                #purchase-a4-preview * {
                    box-sizing: border-box;
                }
                #purchase-a4-preview .text-white {
                    color: white !important;
                }

                @media print {
                    .no-print, .no-print * {
                        display: none !important;
                    }
                    html, body {
                        background: white !important;
                        color: #0f172a !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .min-h-screen, .relative.z-10 {
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: 0 !important;
                        max-width: 100% !important;
                        width: 100% !important;
                    }
                    #purchase-a4-preview {
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        margin: 0 auto !important;
                        padding: 8mm !important;
                        width: 100% !important;
                        max-width: 210mm !important;
                        display: block !important;
                        position: relative !important;
                        left: 0 !important;
                        top: 0 !important;
                        background: white !important;
                        color: #0f172a !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        page-break-inside: avoid;
                    }
                    @page {
                        size: ${invoiceSize};
                        margin: 0;
                    }
                    #purchase-a4-preview td, #purchase-a4-preview th {
                        padding-top: 4px !important;
                        padding-bottom: 4px !important;
                    }
                }
            `}</style>

            <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30" style={{ fontFamily }}>
                {/* Background Effects */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none no-print">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-orange-600/10 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
                </div>

                <div className={`relative z-10 ${invoicePaperClass} mx-auto px-4 py-12 lg:py-20`}>
                    {/* Top Actions */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 no-print">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-500/30">
                                <FileText className="h-6 w-6 text-amber-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Purchase Invoice Official Copy</h1>
                                <p className="text-slate-400 text-sm">#{invoice.billNo}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <button
                                onClick={handleDownloadPDF}
                                disabled={downloading}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                            >
                                <Download className="h-4 w-4" />
                                {downloading ? "Generating PDF..." : "Download PDF"}
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                            >
                                <Printer className="h-4 w-4" />
                                Print
                            </button>
                        </div>
                    </div>

                    {/* Styled Purchase Invoice Card matching Invoice Module Layout */}
                    <div
                                        id="purchase-a4-preview"
                                        className="w-[210mm] min-h-[297mm] bg-white p-10 shadow-2xl relative border border-slate-300 rounded-sm text-slate-900"
                                        style={{
                                            fontFamily: config.design.fontFamily,
                                            fontSize: `${config.design.fontSize}px`,
                                            color: config.design.textColor,
                                            lineHeight: "1.5"
                                        }}
                                    >
                                        {/* Dynamic Styled Sections from sectionsOrder */}
                                        {config.sectionsOrder.map((sectionName) => {
                                            if (sectionName === "header") {
                                                const pos = config.header.logoPosition;
                                                const sz = config.header.logoSize;
                                                const logoHeight = sz === 'small' ? 'h-8' : sz === 'large' ? 'h-16' : 'h-11';
                                                
                                                return (
                                                    <div
                                                        key="header"
                                                        className={`p-6 -mx-10 -mt-10 rounded-t-sm mb-6 flex text-white ${
                                                            pos === 'center' ? 'flex-col items-center text-center justify-center' : pos === 'right' ? 'flex-row-reverse justify-between items-start' : 'flex-row justify-between items-start'
                                                        }`}
                                                        style={{ backgroundColor: config.design.primaryColor }}
                                                    >
                                                        <div className={`flex items-center gap-4 ${pos === 'center' ? 'flex-col' : ''}`}>
                                                            {config.header.showLogo && (
                                                                config.header.logoUrl ? (
                                                                    <img src={config.header.logoUrl} alt="Logo" className={`${logoHeight} w-auto object-contain rounded bg-white/10 p-1`} />
                                                                ) : (
                                                                    <div className={`${logoHeight} w-24 bg-white/20 border border-dashed border-white/40 rounded flex items-center justify-center text-[10px] font-bold text-white`}>
                                                                        LOGO
                                                                    </div>
                                                                )
                                                            )}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{config.header.headerTitle || "TAX INVOICE / PURCHASE BILL"}</p>
                                                                {config.header.showCompanyName && <h2 className="text-2xl font-black text-white">{invoice.supplierName || "SHREE ANDAL TRADERS"}</h2>}
                                                                {config.header.showAddress && <p className="text-xs opacity-90 mt-0.5">{invoice.stateOfSupply ? `State of Supply: ${invoice.stateOfSupply}` : "Supplier Registered Location"}</p>}
                                                                <p className="text-xs opacity-90">
                                                                    {config.header.showPhone && invoice.phone && `Ph: ${invoice.phone}`}
                                                                    {config.header.showPhone && invoice.phone && config.header.showEmail && invoice.gstin && " | "}
                                                                    {config.header.showEmail && invoice.gstin && `GSTIN: ${invoice.gstin}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className={pos === 'center' ? 'mt-3 text-center' : 'text-right'}>
                                                            <p className="text-xs opacity-80 font-medium">
                                                                {config.invoiceInfo.labels?.invoiceNumber || "Bill No."}
                                                            </p>
                                                            <p className="text-xl font-black text-white">#{invoice.billNo}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "supplier" && config.supplier.showName) {
                                                return (
                                                    <div 
                                                        key="supplier" 
                                                        className="mb-5 p-4 border"
                                                        style={{ 
                                                            backgroundColor: config.design.secondaryColor || '#fffbeb',
                                                            borderColor: config.design.borderColor || '#cbd5e1',
                                                            borderRadius: `${config.design.cornerRadius}px`
                                                        }}
                                                    >
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: config.design.primaryColor }}>Supplier (Vendor Details)</h4>
                                                        <p className="font-extrabold text-sm text-slate-950">{invoice.supplierName}</p>
                                                        {config.supplier.showAddress && <p className="text-xs text-slate-600">State of Supply: {invoice.stateOfSupply || "Tamil Nadu"}</p>}
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                                                            {config.supplier.showPhone && invoice.phone && <span>Ph: {invoice.phone}</span>}
                                                            {config.supplier.showGSTIN && invoice.gstin && <span className="font-semibold text-slate-800">GSTIN: {invoice.gstin}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "customer" && config.customer.showName) {
                                                return (
                                                    <div key="customer" className="mb-5 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">Bill To (Customer / Receiving Branch)</h4>
                                                        <p className="font-bold text-xs text-slate-900">{customerDisplayName}</p>
                                                        {config.customer.showBillingAddress && <p className="text-xs text-slate-600">Business State: {invoice.businessState || invoice.stateOfSupply || "Tamil Nadu"}</p>}
                                                        <div className="flex flex-wrap gap-x-4 text-xs text-slate-600 mt-1">
                                                            {config.customer.showPhone && invoice.customerPhone && <span>Ph: {invoice.customerPhone}</span>}
                                                            {config.customer.showGSTIN && invoice.customerGstin && <span className="font-semibold">GSTIN: {invoice.customerGstin}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "invoiceInfo") {
                                                const info = config.invoiceInfo;
                                                return (
                                                    <div key="invoiceInfo" className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                                                        {info.showInvoiceNumber && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceNumber || "Bill No."}</span>
                                                                <span className="font-bold text-slate-900">#{invoice.billNo}</span>
                                                            </div>
                                                        )}
                                                        {info.showInvoiceDate && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceDate || "Bill Date"}</span>
                                                                <span className="font-semibold text-slate-800">{invoice.billDate}</span>
                                                            </div>
                                                        )}
                                                        {info.showDueDate && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">Payment Mode</span>
                                                                <span className="font-semibold text-slate-800">{invoice.paymentMethod || "Cash"}</span>
                                                            </div>
                                                        )}
                                                        {info.showPaymentTerms && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">Customer Type</span>
                                                                <span className="font-semibold text-slate-800">{invoice.customerType || "B2C"}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "items") {
                                                const borderCls = config.design.borderStyle === "none" ? "border-none" : config.design.borderStyle === "medium" ? "border-2 border-slate-300" : "border border-slate-200";
                                                
                                                return (
                                                    <div key="items" className="mb-6 overflow-hidden" style={{ borderRadius: `${config.design.cornerRadius}px` }}>
                                                        <table className={`w-full text-left border-collapse ${borderCls}`}>
                                                            <thead>
                                                                <tr className="text-white text-xs font-bold" style={{ backgroundColor: config.design.primaryColor }}>
                                                                    <th className="py-2.5 px-3">#</th>
                                                                    {config.items.columns.map((col: string) => (
                                                                        <th key={col} className="py-2.5 px-3">
                                                                            {(config.items.labels as any)[col] || col}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 text-xs">
                                                                {invoice.items.map((item, idx) => (
                                                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? config.design.secondaryColor || '#fffbeb' : 'transparent' }}>
                                                                        <td className="py-3 px-3">{idx + 1}</td>
                                                                        {config.items.columns.map((col: string) => {
                                                                            if (col === "item") return <td key={col} className="py-3 px-3 font-bold text-slate-950">{item.itemName}</td>;
                                                                            if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500">{item.description || "-"}</td>;
                                                                            if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600 font-mono text-[11px]">{item.itemCode || "-"}</td>;
                                                                            if (col === "hsn") return <td key={col} className="py-3 px-3 text-slate-600">{item.hsnCode || "-"}</td>;
                                                                            if (col === "quantity") return <td key={col} className="py-3 px-3">{item.quantity} {item.unit}</td>;
                                                                            if (col === "rate") return <td key={col} className="py-3 px-3">₹{(item.pricePerUnit || 0).toFixed(2)}</td>;
                                                                            if (col === "tax") return <td key={col} className="py-3 px-3">{item.taxPercent}% GST</td>;
                                                                            if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹{(item.amount || 0).toFixed(2)}</td>;
                                                                            return <td key={col}>-</td>;
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "tax") {
                                                const taxCfg = config.tax;
                                                return (
                                                    <div key="tax" className="mb-6 flex justify-end">
                                                        <div className="w-72 space-y-1.5 text-xs">
                                                            {taxCfg.showTaxableAmount && <div className="flex justify-between text-slate-600"><span>Taxable Amount</span><span>₹{subtotal.toFixed(2)}</span></div>}
                                                            {taxCfg.showCGST && cgst > 0 && <div className="flex justify-between text-slate-500 text-[11px]"><span>CGST</span><span>₹{cgst.toFixed(2)}</span></div>}
                                                            {taxCfg.showSGST && sgst > 0 && <div className="flex justify-between text-slate-500 text-[11px]"><span>SGST</span><span>₹{sgst.toFixed(2)}</span></div>}
                                                            {taxCfg.showIGST && igst > 0 && <div className="flex justify-between text-slate-500 text-[11px]"><span>IGST</span><span>₹{igst.toFixed(2)}</span></div>}
                                                            {taxCfg.showTotalTax && <div className="flex justify-between text-slate-600 font-medium border-t border-slate-100 pt-1"><span>Total Tax</span><span>₹{totalTax.toFixed(2)}</span></div>}
                                                            <div 
                                                                className="flex justify-between items-center py-2.5 px-3.5 text-white font-bold rounded-lg mt-2 shadow-sm"
                                                                style={{ 
                                                                    backgroundColor: config.design.primaryColor,
                                                                    borderRadius: `${config.design.cornerRadius}px`
                                                                }}
                                                            >
                                                                <span>Grand Total Amount</span>
                                                                <span className="text-base font-black">₹{grandTotal.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "payment" && (config.payment.showPaidAmount || config.payment.showBalance)) {
                                                return (
                                                    <div key="payment" className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                                                        {config.payment.showPaidAmount && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Amount Paid</span><span className="font-bold text-emerald-800 text-sm">₹{paid.toFixed(2)}</span></div>}
                                                        {config.payment.showBalance && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Balance Due</span><span className="font-bold text-rose-700 text-sm">₹{balance.toFixed(2)}</span></div>}
                                                        {config.payment.showPaymentMethod && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Payment Mode</span><span className="font-semibold text-slate-800">{invoice.paymentMethod || "Cash"}</span></div>}
                                                    </div>
                                                );
                                            }

                                            
                                            if (sectionName === "banking" && config.banking?.show) {
                                                return (
                                                    <div key="banking" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">{config.banking.label || "Banking Details"}</p>
                                                        <div className="grid grid-cols-2 gap-2 text-slate-600">
                                                            <p><span className="font-medium text-slate-500">Bank Name:</span> {invoice.bankName || "N/A"}</p>
                                                            <p><span className="font-medium text-slate-500">Account Type:</span> {invoice.accountType || "N/A"}</p>
                                                            <p><span className="font-medium text-slate-500">Account Number:</span> {invoice.accountNumber || "N/A"}</p>
                                                            <p><span className="font-medium text-slate-500">IFSC Code:</span> {invoice.ifscCode || "N/A"}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "notes" && config.notes.show) {
                                                return (
                                                    <div key="notes" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{config.notes.label || "Purchase Notes"}</p>
                                                        <p className="text-slate-600">{config.notes.defaultText}</p>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "terms" && config.terms.show) {
                                                return (
                                                    <div key="terms" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{config.terms.label || "Terms & Conditions"}</p>
                                                        <p className="text-slate-500">{config.terms.defaultText}</p>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "signature" && config.signature.show) {
                                                return (
                                                    <div key="signature" className="mt-8 flex justify-end">
                                                        <div className="text-center w-52">
                                                            {config.signature.imageUrl ? (
                                                                <img src={config.signature.imageUrl} alt="Signature" className="h-12 w-auto mx-auto object-contain mb-1" />
                                                            ) : (
                                                                <div className="h-10 border-b border-slate-400 mb-1"></div>
                                                            )}
                                                            <p className="font-extrabold text-xs text-slate-900">{config.signature.name || "Inventory Manager"}</p>
                                                            <p className="text-[10px] text-slate-500">{config.signature.designation || "Authorized Stock Receiver"}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "footer" && config.footer.show) {
                                                return (
                                                    <div key="footer" className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                        {config.footer.text}
                                                    </div>
                                                );
                                            }

                                            return null;
                                        })}
</div>
                </div>
            </div>
        </>
    );
};

export default PublicPurchaseInvoiceView;
