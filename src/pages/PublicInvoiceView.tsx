import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    FileText,
    Download,
    Printer,
    ArrowLeft,
    CheckCircle,
    Clock,
    AlertCircle,
    Building,
    Mail,
    User,
    Calendar,
    Receipt,
    CreditCard,
    ChevronRight
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { InvoiceTemplateRenderer, generateTemplateInvoicePDF, getTemplateLayoutKey } from "@/components/invoice-templates";

interface InvoiceItem {
    productName: string;
    description?: string;
    codeType?: "HSN" | "SAC";
    hsnCode?: string;
    sacCode?: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    total: number;
}

interface InvoiceData {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerGSTIN?: string;
    businessName: string;
    businessEmail: string;
    businessPhone?: string;
    businessGSTIN?: string;
    businessAddress?: string;
    bankName?: string;
    accountType?: string;
    accountNumber?: string;
    ifscCode?: string;
    authorisedSignature?: string;
    transactionType?: "B2B" | "B2C";
    invoiceSize?: "A4" | "QUARTER_A4" | "A6";
    items: InvoiceItem[];
    subtotal: number;
    taxAmount: number;
    sgst?: number;
    cgst?: number;
    igst?: number;
    grandTotal: number;
    paymentMethod: string;
    status: string;
    templateSnapshot?: any;
    eWayBillNo?: string;
    orderNumber?: string;
    salespersonName?: string;
    paymentTerms?: string;
    shippingCharges?: number;
    packagingCharges?: number;
    freightCharges?: number;
    adjustment?: number;
    amountPaid?: number;
    balanceDue?: number;
}

const PublicInvoiceView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/invoice/public/${id}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && (data.invoiceNumber || data._id)) {
                        setInvoice(data);
                        return;
                    }
                }
            } catch (err) {
                console.warn("API fetch notice, checking local storage:", err);
            }

            // Fallback to local storage
            try {
                const localInvoices = JSON.parse(localStorage.getItem("savedInvoices") || "[]");
                const cleanId = String(id || "").toLowerCase().trim();
                const matched = localInvoices.find((inv: any) => {
                    const invId = String(inv.id || inv._id || "").toLowerCase().trim();
                    const invNo = String(inv.invoiceNo || inv.invoiceNumber || "").toLowerCase().trim();
                    return invId === cleanId || invNo === cleanId;
                });

                if (matched) {
                    const normalized: InvoiceData = {
                        invoiceNumber: matched.invoiceNo || matched.invoiceNumber || id || "INV-001",
                        invoiceDate: matched.invoiceDate || new Date().toISOString().split("T")[0],
                        dueDate: matched.dueDate || matched.invoiceDate || "",
                        customerName: matched.partyName || matched.customerName || "Customer",
                        customerEmail: matched.customerEmail || "",
                        customerPhone: matched.phoneNo || matched.customerPhone || "",
                        customerGSTIN: matched.customerGSTIN || matched.gstin || "",
                        businessName: matched.sellerName || matched.businessName || "Business",
                        businessEmail: matched.sellerEmail || matched.businessEmail || "",
                        businessPhone: matched.sellerPhone || matched.businessPhone || "",
                        businessGSTIN: matched.sellerGSTIN || matched.businessGSTIN || "",
                        businessAddress: matched.sellerAddress || matched.businessAddress || "",
                        bankName: matched.bankName || "",
                        accountType: matched.accountType || "Current",
                        accountNumber: matched.accountNumber || "",
                        ifscCode: matched.ifscCode || "",
                        authorisedSignature: matched.authorisedSignature || "",
                        transactionType: matched.transactionType || "B2C",
                        invoiceSize: matched.invoiceSize || "A4",
                        items: (matched.items || []).map((it: any) => ({
                            productName: it.itemName || it.productName || it.name || "Item",
                            description: it.description || "",
                            codeType: it.codeType || "HSN",
                            hsnCode: it.hsnCode || "",
                            sacCode: it.sacCode || "",
                            unit: it.unit || "Pcs",
                            quantity: Number(it.quantity || 1),
                            unitPrice: Number(it.pricePerUnit || it.unitPrice || 0),
                            taxRate: Number(it.taxPercent || it.taxRate || 0),
                            total: Number(it.amount || it.total || 0)
                        })),
                        subtotal: Number(matched.subtotal || 0),
                        taxAmount: Number(matched.totalTax || matched.taxAmount || 0),
                        sgst: Number(matched.totalSgst || matched.sgst || 0),
                        cgst: Number(matched.totalCgst || matched.cgst || 0),
                        igst: Number(matched.totalIgst || matched.igst || 0),
                        grandTotal: Number(matched.total || matched.grandTotal || 0),
                        paymentMethod: matched.saleType || matched.paymentMethod || "cash",
                        status: matched.status || "sent",
                        templateSnapshot: matched.templateSnapshot || matched.ocrJson?.templateSnapshot,
                        notes: matched.notes || "",
                        termsAndConditions: matched.termsAndConditions || "",
                        amountPaid: Number(matched.paid || matched.amountPaid || 0),
                        balanceDue: Number(matched.balance ?? matched.balanceDue ?? 0)
                    };
                    setInvoice(normalized);
                    return;
                }
            } catch (localErr) {
                console.error("Local storage lookup failed:", localErr);
            }

            setError("Invoice not found or could not be loaded");
        };

        if (id) {
            fetchInvoice().finally(() => setLoading(false));
        } else {
            setError("No invoice ID provided");
            setLoading(false);
        }
    }, [id]);

    const handleDownloadPDF = () => {
        if (!invoice) return;
        try {
            const resolvedLayout = config.layout || getTemplateLayoutKey(invoice);
            generateTemplateInvoicePDF(invoice, config, resolvedLayout, {
                action: 'save',
                filename: `Invoice_${invoice.invoiceNumber || 'bill'}.pdf`
            });
        } catch (err) {
            console.error("PDF generation failed:", err);
            window.print();
        }
    };

    useEffect(() => {
        if (invoice && !loading) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('download') === 'true') {
                const timer = setTimeout(() => {
                    handleDownloadPDF();
                }, 600);
                return () => clearTimeout(timer);
            } else if (params.get('print') === 'true') {
                const timer = setTimeout(() => {
                    window.print();
                }, 600);
                return () => clearTimeout(timer);
            }
        }
    }, [invoice, loading]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-blue-200 font-medium">Loading Invoice...</p>
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
                    <p className="text-slate-400 mb-6">{error || "The invoice you're looking for doesn't exist or the link is invalid."}</p>
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

    const printSizeClass = (invoice.invoiceSize === "QUARTER_A4" || invoice.invoiceSize === "A6") ? "invoice-receipt-copy" : "invoice-a4-copy";

    // ── Safe fallback configuration snapshot ──
    const initialConfig = {
        header: { showLogo: true, logoPosition: "left" as const, logoSize: "medium" as const, logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
        seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
        customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
        invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No.", invoiceDate: "Invoice Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
        },
        items: {
            columns: ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"],
            labels: { item: "Item", sku: "Item Code", description: "Description", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", discount: "Discount", tax: "Tax", amount: "Amount" }
        },
        tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
        payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
        signature: { show: false, name: "", designation: "", imageUrl: "" },
        footer: { show: true, text: "" },
        design: { primaryColor: "#4f46e5", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" as const }
    };

    const config = invoice.templateSnapshot || initialConfig;
    const header = config.header || initialConfig.header;
    const seller = config.seller || initialConfig.seller;
    const customer = config.customer || initialConfig.customer;
    const invoiceInfo = config.invoiceInfo || initialConfig.invoiceInfo;
    const itemsCfg = config.items || initialConfig.items;
    const tax = config.tax || initialConfig.tax;
    const payment = config.payment || initialConfig.payment;
    const signature = config.signature || initialConfig.signature;
    const footer = config.footer || initialConfig.footer;
    const design = config.design || initialConfig.design;

    const primaryColor = design.primaryColor || "#4f46e5";
    const fontFamily = design.fontFamily || "Inter";

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30" style={{ fontFamily }}>
            <style>{`
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body, html {
                        background: white !important;
                        color: #0f172a !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                    }
                    .min-h-screen {
                        min-height: 0 !important;
                        background: transparent !important;
                    }
                    .relative.z-10 {
                        position: static !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                        z-index: auto !important;
                    }
                    #invoice-official-copy {
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        display: block !important;
                    }
                    @page {
                        size: A4;
                        margin: 8mm;
                    }
                    #invoice-official-copy table, #invoice-official-copy tr {
                        break-inside: avoid;
                    }
                }
            `}</style>

            {/* Abstract Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none no-print">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 lg:py-20">
                {/* Top Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 no-print">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                            <FileText className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Invoice Official Copy</h1>
                            <p className="text-slate-400 text-sm">#{invoice.invoiceNumber}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleDownloadPDF}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm"
                        >
                            <Download className="h-4 w-4" />
                            Download PDF
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

                {/* Styled Invoice Card */}
                <div id="invoice-official-copy" className="w-full">
                    <InvoiceTemplateRenderer
                        invoice={invoice}
                        templateConfig={config}
                        layoutKey={config.layout}
                    />
                </div>
            </div>
        </div>
    );
};

export default PublicInvoiceView;

