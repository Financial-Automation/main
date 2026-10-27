import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    FileText,
    Printer,
    Download,
    ArrowLeft,
    AlertCircle
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { 
    InvoiceTemplateRenderer, 
    generateTemplateInvoicePDF, 
    getTemplateLayoutKey,
    TemplateLayoutKey
} from "@/components/invoice-templates";
import { STANDARD_PURCHASE_TEMPLATES, getPurchaseLayoutKey } from "./PurchaseInvoiceTemplates";

const PublicPurchaseInvoiceView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                let response = await fetch(`${API_BASE_URL}/purchase-invoice/public/${id}`);
                if (!response.ok) {
                    response = await fetch(`${API_BASE_URL}/invoice/public/${id}`);
                }
                if (response.ok) {
                    const data = await response.json();
                    if (data && (data.billNo || data.invoiceNumber || data._id)) {
                        setInvoice({
                            ...data,
                            billNo: data.billNo || data.invoiceNumber || data.invoiceNo || id,
                            invoiceNumber: data.billNo || data.invoiceNumber || data.invoiceNo || id,
                            billDate: data.billDate || data.invoiceDate || (data.createdAt ? new Date(data.createdAt).toISOString().split("T")[0] : ""),
                            supplierName: data.supplierName || data.businessName || data.sellerName || "Supplier",
                            customerName: data.customerName || data.partyName || "Customer",
                            items: (data.items || []).map((it: any) => ({
                                itemName: it.itemName || it.productName || it.name || "Item",
                                productName: it.itemName || it.productName || it.name || "Item",
                                description: it.description || "",
                                hsnCode: it.hsnCode || it.sacCode || it.hsn || "",
                                quantity: Number(it.quantity || 1),
                                unitPrice: Number(it.unitPrice || it.pricePerUnit || it.price || it.rate || 0),
                                taxPercent: Number(it.taxPercent || it.taxRate || 0),
                                amount: Number(it.amount || it.total || 0),
                                total: Number(it.amount || it.total || 0),
                                unit: it.unit || "Pcs"
                            })),
                            subtotal: Number(data.subtotal || 0),
                            totalTax: Number(data.totalTax || data.taxAmount || 0),
                            total: Number(data.total || data.grandTotal || 0),
                            grandTotal: Number(data.total || data.grandTotal || 0),
                            paid: Number(data.paid || data.amountPaid || 0),
                            balance: Number(data.balance ?? data.balanceDue ?? 0)
                        });
                        return;
                    }
                }
            } catch (err) {
                console.warn("API fetch notice for purchase invoice:", err);
            }

            // Fallback to local storage
            try {
                const localInvoices = JSON.parse(localStorage.getItem("savedInvoices") || "[]");
                const cleanId = String(id || "").toLowerCase().trim();
                const matched = localInvoices.find((inv: any) => {
                    const invId = String(inv.id || inv._id || "").toLowerCase().trim();
                    const invNo = String(inv.billNo || inv.invoiceNo || inv.invoiceNumber || "").toLowerCase().trim();
                    return invId === cleanId || invNo === cleanId;
                });

                if (matched) {
                    const normalized = {
                        ...matched,
                        _id: matched.id || matched._id,
                        billNo: matched.billNo || matched.invoiceNo || matched.invoiceNumber || id || "BILL-001",
                        invoiceNumber: matched.billNo || matched.invoiceNo || matched.invoiceNumber || id || "BILL-001",
                        billDate: matched.billDate || matched.invoiceDate || new Date().toISOString().split("T")[0],
                        invoiceDate: matched.billDate || matched.invoiceDate || new Date().toISOString().split("T")[0],
                        dueDate: matched.dueDate || matched.invoiceDate || "",
                        paymentTerms: matched.paymentTerms || "Net 15",
                        supplierName: matched.supplierName || matched.partyName || matched.sellerName || "Supplier",
                        phone: matched.phone || matched.phoneNo || matched.supplierPhone || "",
                        gstin: matched.gstin || matched.customerGSTIN || matched.supplierGSTIN || "",
                        customerName: matched.customerName || matched.sellerName || matched.businessName || "Customer",
                        items: (matched.items || []).map((it: any) => ({
                            itemName: it.itemName || it.productName || it.name || "Item",
                            productName: it.itemName || it.productName || it.name || "Item",
                            description: it.description || "",
                            hsnCode: it.hsnCode || it.sacCode || it.hsn || "",
                            quantity: Number(it.quantity || 1),
                            unitPrice: Number(it.pricePerUnit || it.unitPrice || it.price || 0),
                            taxPercent: Number(it.taxPercent || it.taxRate || 0),
                            amount: Number(it.amount || it.total || 0),
                            total: Number(it.amount || it.total || 0),
                            unit: it.unit || "Pcs"
                        })),
                        subtotal: Number(matched.subtotal || 0),
                        totalTax: Number(matched.totalTax || matched.taxAmount || 0),
                        total: Number(matched.total || matched.grandTotal || 0),
                        grandTotal: Number(matched.total || matched.grandTotal || 0),
                        paid: Number(matched.paid || matched.amountPaid || 0),
                        balance: Number(matched.balance ?? matched.balanceDue ?? 0),
                        paymentMethod: matched.saleType || matched.paymentMethod || "Cash"
                    };
                    setInvoice(normalized);
                    return;
                }
            } catch (localErr) {
                console.error("Local storage lookup failed for purchase invoice:", localErr);
            }

            setError("Purchase invoice not found or could not be loaded");
        };

        if (id) {
            fetchInvoice().finally(() => setLoading(false));
        } else {
            setError("No invoice ID provided");
            setLoading(false);
        }
    }, [id]);

    // Resolve template config & layout key
    const standardMatch = STANDARD_PURCHASE_TEMPLATES.find(
        t => t._id === invoice?.templateId || 
             (t.name && (t.name.toLowerCase() === (invoice?.templateName || "").toLowerCase())) ||
             (invoice?.templateId && t._id.toLowerCase().includes(String(invoice.templateId).toLowerCase()))
    );

    const resolvedLayout: TemplateLayoutKey =
        (invoice?.templateSnapshot?.layout as TemplateLayoutKey) ||
        (invoice?.templateLayout as TemplateLayoutKey) ||
        (standardMatch ? (getPurchaseLayoutKey(standardMatch) as TemplateLayoutKey) : undefined) ||
        (invoice?.templateSnapshot ? (getPurchaseLayoutKey(invoice.templateSnapshot) as TemplateLayoutKey) : undefined) ||
        (invoice?.templateName ? (getPurchaseLayoutKey({ name: invoice.templateName }) as TemplateLayoutKey) : undefined) ||
        (getTemplateLayoutKey(invoice?.templateSnapshot || invoice) as TemplateLayoutKey);

    const config = {
        ...(standardMatch?.config || {}),
        ...(invoice?.templateSnapshot || {}),
        layout: resolvedLayout,
        design: {
            ...(standardMatch?.config?.design || {}),
            ...(invoice?.templateSnapshot?.design || {})
        }
    };

    const handleDownloadPDF = () => {
        if (!invoice) return;
        try {
            const billNo = invoice.billNo || invoice.invoiceNumber || id || "bill";
            generateTemplateInvoicePDF(invoice, config, resolvedLayout, {
                action: 'save',
                filename: `Purchase_Invoice_${billNo}.pdf`
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
                    <h1 className="text-2xl font-bold text-white mb-2">Purchase Invoice Not Found</h1>
                    <p className="text-slate-400 mb-6">{error || "The purchase invoice you're looking for doesn't exist or the link is invalid."}</p>
                    <button
                        onClick={() => navigate("/inventory")}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-all"
                    >
                        Go to Inventory
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30">
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
                        max-width: 100% !important;
                    }
                    #purchase-invoice-print-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    table, tr, td, th {
                        page-break-inside: avoid;
                        break-inside: avoid;
                    }
                }
            `}</style>

            {/* Abstract Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none no-print">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-amber-700/10 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 lg:py-14">
                {/* Top Action Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 no-print bg-slate-900/80 backdrop-blur border border-white/10 p-4 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/inventory")}
                            className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition-colors"
                            title="Back to Inventory"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30">
                            <FileText className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-white">Purchase Invoice</h1>
                                <span className="bg-amber-400/20 text-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-400/30 capitalize">
                                    {resolvedLayout.replace(/-/g, " ")}
                                </span>
                            </div>
                            <p className="text-slate-400 text-xs">#{invoice.billNo || invoice.invoiceNumber}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                            onClick={handleDownloadPDF}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                        >
                            <Download className="h-4 w-4" />
                            Download PDF
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white rounded-xl font-bold text-xs transition-all"
                        >
                            <Printer className="h-4 w-4" />
                            Print
                        </button>
                    </div>
                </div>

                {/* Render the Exact Selected Template */}
                <div id="purchase-invoice-print-container" className="w-full">
                    <InvoiceTemplateRenderer
                        invoice={invoice}
                        templateConfig={config}
                        layoutKey={resolvedLayout}
                    />
                </div>
            </div>
        </div>
    );
};

export default PublicPurchaseInvoiceView;
