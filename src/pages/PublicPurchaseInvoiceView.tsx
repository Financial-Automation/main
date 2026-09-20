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
    const invoiceFormat = invoice.invoiceFormat || "Supermarket";
    const invoicePaperClass = invoiceSize === "A5" ? "max-w-[720px]" : "max-w-5xl";

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
                    background-color: transparent !important;
                    background-image: none !important;
                }
                #purchase-invoice-print .text-amber-350,
                #purchase-invoice-print .text-slate-350,
                #purchase-invoice-print .text-amber-400,
                #purchase-invoice-print .text-amber-300 {
                    color: #d97706 !important;
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
                    color: #0f172a !important;
                }
                #purchase-invoice-print .border-amber-400\/30,
                #purchase-invoice-print .border-white\/10 {
                    border-color: #cbd5e1 !important;
                }
                #purchase-invoice-print .bg-amber-400\/10 {
                    background-color: #fef3c7 !important;
                }
                #purchase-invoice-print .bg-black\/20,
                #purchase-invoice-print .bg-white\/5 {
                    background-color: #f8fafc !important;
                }
                #purchase-invoice-print .text-slate-400,
                #purchase-invoice-print .text-slate-300 {
                    color: #4b5563 !important;
                }
                #purchase-invoice-print .bg-gradient-to-r {
                    background: transparent !important;
                }

                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body, html, .min-h-screen, .relative.z-10, .max-w-5xl, .max-w-\[720px\] {
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
                    #purchase-invoice-print * {
                        color: #0f172a !important;
                        background-color: transparent !important;
                        background-image: none !important;
                    }
                    @page {
                        size: ${invoiceSize};
                        margin: 8mm;
                    }
                    #purchase-invoice-print td, #purchase-invoice-print th {
                        padding-top: 5px !important;
                        padding-bottom: 5px !important;
                    }
                    #purchase-invoice-print h2, #purchase-invoice-print h1, #purchase-invoice-print p {
                        margin-top: 1px !important;
                        margin-bottom: 1px !important;
                    }
                }
            `}</style>
            <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30">
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
                                <h1 className="text-2xl font-bold text-white">Purchase Invoice</h1>
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

                    {/* Invoice Card */}
                    <div id="purchase-invoice-print" className="backdrop-blur-2xl bg-white/[0.04] border border-white/10 rounded-[28px] shadow-2xl overflow-hidden">
                        {/* Header Section */}
                        <div className="p-8 lg:p-10 border-b border-white/10 bg-gradient-to-r from-amber-600/30 via-orange-500/20 to-rose-500/10">
                            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">{invoiceFormat}</p>
                                    <h2 className="mt-2 text-4xl font-black tracking-tight text-white">Tax Invoice</h2>
                                    <p className="mt-2 text-sm text-slate-400">Inventory Management - Purchase Invoice</p>
                                </div>
                                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-right">
                                    <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Bill No</p>
                                    <p className="text-xl font-black text-white">{invoice.billNo}</p>
                                    <p className="mt-1 text-sm text-slate-300">{invoice.billDate}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-4">Supplier</h2>
                                        <div className="space-y-1">
                                            <p className="text-xl font-bold text-white">{invoice.supplierName}</p>
                                            {invoice.phone && <p className="text-slate-400">Phone: {invoice.phone}</p>}
                                            {invoice.gstin && <p className="text-slate-400">GSTIN: {invoice.gstin}</p>}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-4">Bill To</h2>
                                        <div className="space-y-1">
                                            <p className="text-xl font-bold text-white">{invoice.customerName || "Walk-in Customer"}</p>
                                            <p className="text-slate-400">Type: {invoice.customerType || "B2C"}</p>
                                            {invoice.customerPhone && <p className="text-slate-400">Phone: {invoice.customerPhone}</p>}
                                            {invoice.customerType === "B2B" && invoice.customerGstin && (
                                                <p className="text-slate-400">GSTIN: {invoice.customerGstin}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 md:text-right flex flex-col md:items-end">
                                    <div className="grid grid-cols-2 gap-4 md:w-full">
                                        <div>
                                            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</h2>
                                            <p className="text-white font-medium">{invoice.paymentMethod || "Cash"}</p>
                                        </div>
                                        <div>
                                            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Size</h2>
                                            <p className="text-white font-medium">{invoiceSize}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">State of Supply</h2>
                                            <p className="text-white font-medium">{invoice.stateOfSupply}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="p-8 lg:p-12">
                            <div className="w-full overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/10 text-left bg-white/5">
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400">Item</th>
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400 text-center">Qty</th>
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400 text-center">Unit</th>
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400 text-right">Price/Unit</th>
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400 text-right">Tax</th>
                                            <th className="py-4 px-3 text-xs font-bold uppercase tracking-wider text-amber-400 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {invoice.items.map((item, idx) => (
                                            <tr key={idx} className="group">
                                                <td className="py-6 pr-4">
                                                    <p className="text-white font-semibold transition-colors group-hover:text-amber-400">{item.itemName}</p>
                                                    {item.hsnCode && <p className="text-slate-500 text-xs mt-1">{item.codeType || "HSN"}: {item.hsnCode}</p>}
                                                </td>
                                                <td className="py-6 text-center text-slate-300 font-medium">{item.quantity}</td>
                                                <td className="py-6 text-center text-slate-300 font-medium">{item.unit}</td>
                                                <td className="py-6 text-right text-slate-300 font-medium">₹{item.pricePerUnit.toFixed(2)}</td>
                                                <td className="py-6 text-right text-slate-300 font-medium">{item.taxPercent}%</td>
                                                <td className="py-6 text-right text-white font-bold">₹{item.amount.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Totals Section */}
                            <div className="mt-12 flex flex-col md:flex-row justify-between items-start gap-12 pt-12 border-t border-white/10">
                                <div className="max-w-xs">
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-4">Payment Summary</h2>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                                            <div>
                                                <p className="text-xs text-slate-500 uppercase">Paid</p>
                                                <p className="text-emerald-400 font-bold text-lg">₹{invoice.paid.toFixed(2)}</p>
                                            </div>
                                        </div>
                                        {invoice.balance > 0 && (
                                            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-red-500/20">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase">Balance Due</p>
                                                    <p className="text-red-400 font-bold text-lg">₹{invoice.balance.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full md:w-80 space-y-4">
                                    <div className="flex justify-between items-center text-slate-400">
                                        <span>Subtotal</span>
                                        <span className="text-white font-medium">₹{invoice.subtotal.toFixed(2)}</span>
                                    </div>
                                    {/* GST Breakdown */}
                                    {(invoice.totalSgst > 0 || invoice.totalCgst > 0) ? (
                                        <>
                                            <div className="flex justify-between items-center text-slate-400 text-sm">
                                                <span>SGST</span>
                                                <span className="text-white font-medium">₹{invoice.totalSgst.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-slate-400 text-sm">
                                                <span>CGST</span>
                                                <span className="text-white font-medium">₹{invoice.totalCgst.toFixed(2)}</span>
                                            </div>
                                        </>
                                    ) : invoice.totalIgst > 0 ? (
                                        <div className="flex justify-between items-center text-slate-400 text-sm">
                                            <span>IGST</span>
                                            <span className="text-white font-medium">₹{invoice.totalIgst.toFixed(2)}</span>
                                        </div>
                                    ) : null}
                                    <div className="flex justify-between items-center text-slate-400 pb-4 border-b border-white/5">
                                        <span>Total Tax</span>
                                        <span className="text-white font-medium">₹{invoice.totalTax.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-lg font-bold text-white">Grand Total</span>
                                        <span className="text-3xl font-black text-white bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 rounded-2xl shadow-lg transition-transform hover:scale-105">
                                            ₹{invoice.total.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
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

                        {/* Footer */}
                        <div className="px-8 lg:px-12 py-8 bg-black/20 border-t border-white/5 text-center">
                            <p className="text-slate-500 text-sm">
                                This is a digitally generated purchase invoice.
                            </p>
                            <p className="text-amber-500/60 text-[11px] mt-2 tracking-widest font-bold uppercase">
                                Shree Andal AI Software Solutions (OPC) Pvt Ltd
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PublicPurchaseInvoiceView;
