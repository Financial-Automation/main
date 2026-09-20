import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    FileText,
    Printer,
    AlertCircle,
} from "lucide-react";
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
}

interface PurchaseInvoiceData {
    _id: string;
    customerType?: "B2B" | "B2C";
    customerName?: string;
    customerPhone?: string;
    customerGstin?: string;
    supplierName: string;
    phone: string;
    gstin: string;
    billNo: string;
    billDate: string;
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
            if (params.get('print') === 'true' || params.get('download') === 'true') {
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

    // Safe fallback template configuration
    const initialConfig = {
        header: { showLogo: true, logoPosition: "left" as const, logoSize: "medium" as const, logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
        seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
        customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
        invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Bill No.", invoiceDate: "Bill Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
        },
        items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item", description: "Description", sku: "SKU", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Amount" }
        },
        tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
        payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
        footer: { show: true, text: "" },
        design: { primaryColor: "#d97706", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" as const }
    };

    const config = invoice.templateSnapshot || initialConfig;
    const header = config.header || initialConfig.header;
    const design = config.design || initialConfig.design;
    const primaryColor = design.primaryColor || "#d97706";
    const fontFamily = design.fontFamily || "Inter";

    return (
        <>
            <style>{`
                /* Screen view overrides for clean print preview */
                #purchase-invoice-print {
                    background: white !important;
                    color: #0f172a !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 12px !important;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05) !important;
                }
                #purchase-invoice-print * {
                    color: #0f172a !important;
                }
                #purchase-invoice-print th {
                    background-color: #f8fafc !important;
                    color: #0f172a !important;
                    border-bottom: 2px solid #cbd5e1 !important;
                }
                #purchase-invoice-print td {
                    border-bottom: 1px solid #f1f5f9 !important;
                }
                #purchase-invoice-print .text-white {
                    color: white !important;
                }

                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body, html, .min-h-screen, .relative.z-10 {
                        background: white !important;
                        color: #0f172a !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        max-width: 100% !important;
                    }
                    #purchase-invoice-print {
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        display: block !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        page-break-inside: avoid;
                    }
                    @page {
                        size: ${invoiceSize};
                        margin: 8mm;
                    }
                    #purchase-invoice-print td, #purchase-invoice-print th {
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
                                onClick={() => window.print()}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                            >
                                <Printer className="h-4 w-4" />
                                Print
                            </button>
                        </div>
                    </div>

                    {/* Styled Purchase Invoice Card matching Invoice Module Layout */}
                    <div id="purchase-invoice-print" className="bg-white border border-slate-300 rounded-[12px] shadow-md overflow-hidden text-slate-950 p-8 lg:p-12 space-y-6">
                        
                        {/* Header Banner using Primary Theme Color */}
                        <div className="p-8 -mx-8 -mt-8 rounded-t-[11px] mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-white" style={{ backgroundColor: primaryColor }}>
                            <div className="flex items-center gap-4">
                                {header.showLogo && header.logoUrl && (
                                    <img src={header.logoUrl} alt="Logo" className="h-10 w-auto object-contain rounded-md" />
                                )}
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">Tax Invoice / Purchase Bill</p>
                                    <h2 className="mt-1 text-2xl lg:text-3xl font-black text-white">{invoice.supplierName}</h2>
                                    <p className="mt-1 text-sm opacity-90 font-medium">
                                        {[
                                            invoice.phone ? `Ph: ${invoice.phone}` : '',
                                            invoice.gstin ? `GSTIN: ${invoice.gstin}` : '',
                                            invoice.stateOfSupply ? `State: ${invoice.stateOfSupply}` : ''
                                        ].filter(Boolean).join("  |  ")}
                                    </p>
                                </div>
                            </div>
                            <div className="md:text-right">
                                <p className="text-sm opacity-80 font-medium">Bill No.</p>
                                <p className="text-2xl font-black text-white">#{invoice.billNo}</p>
                                <p className="mt-2 inline-flex rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white border border-white/20">
                                    {invoice.customerType || "B2C"} | {invoiceSize}
                                </p>
                            </div>
                        </div>

                        {/* Details Section: Supplier (From) & Customer (Bill To) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-200 pb-6">
                            <div className="space-y-4">
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider mb-2 border-l-2 pl-2" style={{ color: primaryColor, borderColor: primaryColor }}>Supplier (Vendor)</h2>
                                    <div className="space-y-0.5 text-sm">
                                        <p className="font-bold text-slate-950">{invoice.supplierName}</p>
                                        {invoice.phone && <p className="text-slate-650">Ph: {invoice.phone}</p>}
                                        {invoice.gstin && <p className="text-slate-650">GSTIN: {invoice.gstin}</p>}
                                        <p className="text-slate-650">State of Supply: {invoice.stateOfSupply}</p>
                                    </div>
                                </div>

                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider mb-2 border-l-2 pl-2" style={{ color: primaryColor, borderColor: primaryColor }}>Bill To (Customer)</h2>
                                    <div className="space-y-0.5 text-sm">
                                        <p className="font-bold text-slate-950">{invoice.customerName || "Walk-in Customer"}</p>
                                        <p className="text-slate-650">Type: {invoice.customerType || "B2C"}</p>
                                        {invoice.customerPhone && <p className="text-slate-650">Phone: {invoice.customerPhone}</p>}
                                        {invoice.customerGstin && <p className="text-slate-650">GSTIN: {invoice.customerGstin}</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 md:text-right flex flex-col md:items-end text-sm">
                                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 w-48 text-left md:text-right">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bill Date</h2>
                                    <p className="text-slate-950 font-bold">{invoice.billDate}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 w-48 text-left md:text-right">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Method</h2>
                                    <p className="text-slate-950 font-bold">{invoice.paymentMethod || "Cash"}</p>
                                </div>
                                <div className="text-xs text-slate-500">
                                    <span className="font-semibold">Business State:</span> {invoice.businessState || "Tamil Nadu"}
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="w-full overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-200 text-left bg-slate-50">
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650">Item</th>
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 text-center">Qty</th>
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 text-center">Unit</th>
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 text-right">Price/Unit</th>
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 text-right">Tax</th>
                                        <th className="py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoice.items.map((item, idx) => (
                                        <tr key={idx} className="text-sm">
                                            <td className="py-4 px-2">
                                                <p className="text-slate-950 font-semibold">{item.itemName}</p>
                                                {item.hsnCode && <p className="text-slate-400 text-xs mt-0.5">{item.codeType || "HSN"}: {item.hsnCode}</p>}
                                            </td>
                                            <td className="py-4 px-2 text-center text-slate-700">{item.quantity}</td>
                                            <td className="py-4 px-2 text-center text-slate-700">{item.unit || "Pcs"}</td>
                                            <td className="py-4 px-2 text-right text-slate-700">₹{item.pricePerUnit.toFixed(2)}</td>
                                            <td className="py-4 px-2 text-right text-slate-700">{item.taxPercent}%</td>
                                            <td className="py-4 px-2 text-right text-slate-950 font-bold">₹{item.amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Summary */}
                        <div className="flex flex-col md:flex-row justify-between items-start gap-8 pt-6 border-t border-slate-200">
                            <div className="text-xs text-slate-500 max-w-md space-y-2">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">Payment Summary</p>
                                    <p className="text-emerald-700 font-semibold text-sm">Amount Paid: ₹{invoice.paid.toFixed(2)}</p>
                                    {invoice.balance > 0 && (
                                        <p className="text-rose-700 font-semibold text-sm mt-1">Balance Due: ₹{invoice.balance.toFixed(2)}</p>
                                    )}
                                </div>
                            </div>

                            <div className="w-full md:w-72 space-y-2.5 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Subtotal</span>
                                    <span>₹{invoice.subtotal.toFixed(2)}</span>
                                </div>

                                {invoice.totalSgst > 0 && (
                                    <div className="flex justify-between text-slate-500 text-xs">
                                        <span>SGST</span>
                                        <span>₹{invoice.totalSgst.toFixed(2)}</span>
                                    </div>
                                )}
                                {invoice.totalCgst > 0 && (
                                    <div className="flex justify-between text-slate-500 text-xs">
                                        <span>CGST</span>
                                        <span>₹{invoice.totalCgst.toFixed(2)}</span>
                                    </div>
                                )}
                                {invoice.totalIgst > 0 && (
                                    <div className="flex justify-between text-slate-500 text-xs">
                                        <span>IGST</span>
                                        <span>₹{invoice.totalIgst.toFixed(2)}</span>
                                    </div>
                                )}

                                {invoice.totalTax > 0 && (
                                    <div className="flex justify-between text-slate-600">
                                        <span>Total Tax</span>
                                        <span>₹{invoice.totalTax.toFixed(2)}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-3 pb-3 px-4 rounded-xl shadow-md text-white" style={{ backgroundColor: primaryColor }}>
                                    <span className="text-base font-bold">Grand Total</span>
                                    <span className="text-2xl font-black">
                                        ₹{invoice.total.toFixed(2)}
                                    </span>
                                </div>

                                {invoice.paid > 0 && (
                                    <div className="flex justify-between text-slate-600 text-xs pt-2">
                                        <span>Paid</span>
                                        <span className="text-emerald-600 font-bold">₹{invoice.paid.toFixed(2)}</span>
                                    </div>
                                )}

                                {invoice.balance > 0 && (
                                    <div className="flex justify-between text-slate-600 text-xs pt-1">
                                        <span>Balance Due</span>
                                        <span className="text-rose-600 font-bold">₹{invoice.balance.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Authorised Signature & Banking Details */}
                            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-end gap-6 text-left">
                                <div className="text-xs text-slate-400 space-y-1">
                                    <p className="font-bold uppercase tracking-wider text-amber-400 text-xs mb-1">Banking Details</p>
                                    <p><span className="text-slate-500 font-medium">Company:</span> Shree Andal AI Software Solutions (OPC) Pvt Ltd</p>
                                    {invoice.gstin && <p><span className="text-slate-500 font-medium">GSTIN:</span> {invoice.gstin}</p>}
                                </div>
                                <div className="text-right">
                                    <div className="w-48 text-center pt-2">
                                        <div className="border-t border-white/20 pt-1">
                                            <p className="text-xs font-bold text-white uppercase tracking-wider">Authorised Signature</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="px-8 py-8 bg-slate-50 border-t border-slate-200 text-center rounded-b-[11px]">
                            <p className="text-slate-500 text-xs">
                                This is a digitally generated purchase invoice.
                            </p>
                            <p className="text-slate-400 text-[10px] mt-2 tracking-widest font-bold uppercase">
                                Shree Andal AI Software Solutions (OPC) Pvt Ltd • Powered by FinSmart ✨
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PublicPurchaseInvoiceView;
