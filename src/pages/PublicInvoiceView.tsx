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
                if (!response.ok) {
                    throw new Error("Invoice not found or could not be loaded");
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
                /* Screen view overrides for clean print preview */
                #invoice-official-copy {
                    background: white !important;
                    color: #0f172a !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 12px !important;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05) !important;
                }
                #invoice-official-copy * {
                    color: #0f172a !important;
                    background-color: transparent !important;
                    background-image: none !important;
                }
                #invoice-official-copy .text-indigo-700 {
                    color: ${primaryColor} !important;
                }
                #invoice-official-copy .text-white {
                    color: white !important;
                }
                #invoice-official-copy th {
                    background-color: #f8fafc !important;
                    color: #0f172a !important;
                    border-bottom: 2px solid #cbd5e1 !important;
                }
                #invoice-official-copy td {
                    border-bottom: 1px solid #f1f5f9 !important;
                }

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
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                    }
                    @page {
                        size: A4;
                        margin: 8mm;
                    }
                    #invoice-official-copy table {
                        page-break-inside: avoid;
                    }
                    #invoice-official-copy tr {
                        page-break-inside: avoid;
                    }
                    #invoice-official-copy td, #invoice-official-copy th {
                        padding-top: 4px !important;
                        padding-bottom: 4px !important;
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
                            onClick={() => window.print()}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                        >
                            <Printer className="h-4 w-4" />
                            Print
                        </button>
                    </div>
                </div>

                {/* Styled Invoice Card */}
                <div id="invoice-official-copy" className={`official-copy ${printSizeClass} bg-white border border-slate-350 rounded-[12px] shadow-md overflow-hidden text-slate-950 p-8 lg:p-12 space-y-6 max-w-4xl mx-auto`}>
                    
                    {/* Header Banner using Template Design Primary Color */}
                    <div className="p-8 -mx-8 -mt-8 rounded-t-[11px] mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-white" style={{ backgroundColor: primaryColor }}>
                        <div className="flex items-center gap-4">
                            {header.showLogo && header.logoUrl && (
                                <img src={header.logoUrl} alt="Logo" className="h-10 w-auto object-contain rounded-md" />
                            )}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">Tax Invoice</p>
                                {header.showCompanyName && (
                                    <h2 className="mt-1 text-2xl lg:text-3xl font-black text-white">{invoice.businessName}</h2>
                                )}
                                <p className="mt-1 text-sm opacity-90 font-medium">
                                    {[
                                        invoice.businessAddress ? invoice.businessAddress : '',
                                        header.showEmail && invoice.businessEmail ? invoice.businessEmail : '',
                                        header.showPhone && invoice.businessPhone ? invoice.businessPhone : '',
                                        invoice.businessGSTIN ? `GSTIN: ${invoice.businessGSTIN}` : ''
                                    ].filter(Boolean).join("  |  ")}
                                </p>
                            </div>
                        </div>
                        <div className="md:text-right">
                            <p className="text-sm opacity-80 font-medium">{invoiceInfo.labels?.invoiceNumber || "Invoice Number"}</p>
                            <p className="text-2xl font-black text-white">#{invoice.invoiceNumber}</p>
                            <p className="mt-2 inline-flex rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white border border-white/20">
                                {invoice.transactionType || "B2C"} | {printSizeClass === "invoice-receipt-copy" ? "A6" : "A4"}
                            </p>
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-200 pb-6">
                        <div className="space-y-4">
                            {customer.showName && (
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider mb-2 border-l-2 pl-2" style={{ color: primaryColor, borderColor: primaryColor }}>Bill To</h2>
                                    <div className="space-y-0.5 text-sm">
                                        <p className="font-bold text-slate-950">{invoice.customerName}</p>
                                        {customer.showEmail && invoice.customerEmail && <p className="text-slate-650">Email: {invoice.customerEmail}</p>}
                                        {customer.showPhone && invoice.customerPhone && <p className="text-slate-650">Phone: {invoice.customerPhone}</p>}
                                        {customer.showGSTIN && invoice.customerGSTIN && <p className="text-slate-650">GSTIN: {invoice.customerGSTIN}</p>}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 md:text-right flex flex-col md:items-end text-sm">
                            {invoiceInfo.showInvoiceDate && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 w-48 text-left md:text-right">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{invoiceInfo.labels?.invoiceDate || "Invoice Date"}</h2>
                                    <p className="text-slate-950 font-bold">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
                                </div>
                            )}
                            {invoiceInfo.showDueDate && invoice.dueDate && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 w-48 text-left md:text-right">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{invoiceInfo.labels?.dueDate || "Due Date"}</h2>
                                    <p className="text-slate-950 font-bold">{new Date(invoice.dueDate).toLocaleDateString()}</p>
                                </div>
                            )}
                            {invoiceInfo.showPaymentTerms && invoice.paymentTerms && (
                                <div className="text-xs text-slate-500">
                                    <span className="font-semibold">{invoiceInfo.labels?.paymentTerms || "Terms"}:</span> {invoice.paymentTerms}
                                </div>
                            )}
                            {invoiceInfo.showOrderNumber && invoice.orderNumber && (
                                <div className="text-xs text-slate-500">
                                    <span className="font-semibold">{invoiceInfo.labels?.orderNumber || "Order No"}:</span> {invoice.orderNumber}
                                </div>
                            )}
                            {invoiceInfo.showSalesperson && invoice.salespersonName && (
                                <div className="text-xs text-slate-500">
                                    <span className="font-semibold">{invoiceInfo.labels?.salespersonName || "Salesperson"}:</span> {invoice.salespersonName}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Dynamic Items Table */}
                    <div className="w-full overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-200 text-left bg-slate-50">
                                    {itemsCfg.columns.map((colName: string) => {
                                        const alignment = (colName === "rate" || colName === "discount" || colName === "amount") ? "text-right" : (colName === "quantity" || colName === "tax") ? "text-center" : "text-left";
                                        const label = itemsCfg.labels?.[colName] || colName.toUpperCase();
                                        return (
                                            <th key={colName} className={`py-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-650 ${alignment}`}>
                                                {label}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoice.items.map((item, idx) => (
                                    <tr key={idx} className="text-sm">
                                        {itemsCfg.columns.map((colName: string) => {
                                            const alignment = (colName === "rate" || colName === "discount" || colName === "amount") ? "text-right" : (colName === "quantity" || colName === "tax") ? "text-center" : "text-left";
                                            return (
                                                <td key={colName} className={`py-4 px-2 ${alignment}`}>
                                                    {colName === "item" && (
                                                        <div>
                                                            <p className="text-slate-950 font-semibold">{item.productName}</p>
                                                        </div>
                                                    )}
                                                    {colName === "sku" && <span className="text-slate-650">{item.itemCode || item.sku || "-"}</span>}
                                                    {colName === "description" && <span className="text-slate-650">{item.description || "-"}</span>}
                                                    {colName === "hsn" && <span className="text-slate-650">{item.hsnCode || item.sacCode || "-"}</span>}
                                                    {colName === "quantity" && <span className="text-slate-700">{item.quantity} {item.unit || "Pcs"}</span>}
                                                    {colName === "rate" && <span className="text-slate-700">₹{(item.unitPrice || 0).toFixed(2)}</span>}
                                                    {colName === "discount" && <span className="text-slate-700">{item.discount ? `${item.discount}%` : (item.discountAmount ? `₹${item.discountAmount.toFixed(2)}` : "0%")}</span>}
                                                    {colName === "tax" && <span className="text-slate-700">{item.taxRate || 0}%</span>}
                                                    {colName === "amount" && <span className="text-slate-950 font-bold">₹{item.total.toFixed(2)}</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals Summary */}
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8 pt-6 border-t border-slate-200">
                        <div className="text-xs text-slate-500">
                            {config.notes?.show && config.notes?.defaultText && (
                                <div className="mb-4">
                                    <p className="font-bold text-slate-650 mb-1">{config.notes?.label || "Notes"}</p>
                                    <p className="max-w-md">{config.notes?.defaultText}</p>
                                </div>
                            )}
                            {config.terms?.show && config.terms?.defaultText && (
                                <div>
                                    <p className="font-bold text-slate-650 mb-1">{config.terms?.label || "Terms & Conditions"}</p>
                                    <p className="max-w-md">{config.terms?.defaultText}</p>
                                </div>
                            )}
                        </div>

                        <div className="w-full md:w-72 space-y-2.5 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>Subtotal</span>
                                <span>₹{invoice.subtotal.toFixed(2)}</span>
                            </div>

                            {tax.showCGST && invoice.cgst && invoice.cgst > 0 && (
                                <div className="flex justify-between text-slate-500 text-xs">
                                    <span>CGST</span>
                                    <span>₹{invoice.cgst.toFixed(2)}</span>
                                </div>
                            )}
                            {tax.showSGST && invoice.sgst && invoice.sgst > 0 && (
                                <div className="flex justify-between text-slate-500 text-xs">
                                    <span>SGST</span>
                                    <span>₹{invoice.sgst.toFixed(2)}</span>
                                </div>
                            )}
                            {tax.showIGST && invoice.igst && invoice.igst > 0 && (
                                <div className="flex justify-between text-slate-500 text-xs">
                                    <span>IGST</span>
                                    <span>₹{invoice.igst.toFixed(2)}</span>
                                </div>
                            )}

                            {tax.showTotalTax && invoice.taxAmount > 0 && (
                                <div className="flex justify-between text-slate-600">
                                    <span>Total Tax</span>
                                    <span>₹{invoice.taxAmount.toFixed(2)}</span>
                                </div>
                            )}

                            {invoice.shippingCharges && invoice.shippingCharges > 0 ? (
                                <div className="flex justify-between text-slate-600 text-xs">
                                    <span>Shipping</span>
                                    <span>₹{invoice.shippingCharges.toFixed(2)}</span>
                                </div>
                            ) : null}
                            {invoice.packagingCharges && invoice.packagingCharges > 0 ? (
                                <div className="flex justify-between text-slate-600 text-xs">
                                    <span>Packaging</span>
                                    <span>₹{invoice.packagingCharges.toFixed(2)}</span>
                                </div>
                            ) : null}
                            {invoice.freightCharges && invoice.freightCharges > 0 ? (
                                <div className="flex justify-between text-slate-600 text-xs">
                                    <span>Freight</span>
                                    <span>₹{invoice.freightCharges.toFixed(2)}</span>
                                </div>
                            ) : null}
                            {invoice.adjustment && invoice.adjustment !== 0 ? (
                                <div className="flex justify-between text-slate-600 text-xs">
                                    <span>Adjustment</span>
                                    <span>₹{invoice.adjustment.toFixed(2)}</span>
                                </div>
                            ) : null}

                            <div className="flex justify-between items-center pt-3 pb-3 px-4 rounded-xl shadow-md text-white" style={{ backgroundColor: primaryColor }}>
                                <span className="text-base font-bold">Grand Total</span>
                                <span className="text-2xl font-black">
                                    ₹{invoice.grandTotal.toFixed(2)}
                                </span>
                            </div>

                            <div className="flex justify-between text-slate-600 text-xs pt-2">
                                <span>Amount Paid</span>
                                <span className="text-emerald-600 font-bold">₹{(invoice.amountPaid || 0).toFixed(2)}</span>
                            </div>

                            <div className="flex justify-between text-slate-600 text-xs pt-1">
                                <span>Balance Due</span>
                                <span className="text-rose-600 font-bold">₹{(invoice.balanceDue ?? (invoice.grandTotal - (invoice.amountPaid || 0))).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Banking Details & Authorized Signatory Block */}
                    <div className="pt-6 flex flex-col md:flex-row justify-between items-end gap-6 border-t border-slate-200">
                        <div className="text-left space-y-1 text-xs text-slate-650">
                            <p className="font-bold text-slate-900 uppercase tracking-wider text-xs mb-1">Banking Details</p>
                            <p><span className="font-semibold text-slate-500">Bank Name:</span> {invoice.bankName || "ABC Bank"}</p>
                            <p><span className="font-semibold text-slate-500">Account Type:</span> {invoice.accountType || "Current"}</p>
                            <p><span className="font-semibold text-slate-500">Account Number:</span> {invoice.accountNumber || "XXXXXXXX"}</p>
                            <p><span className="font-semibold text-slate-500">IFSC Code:</span> {invoice.ifscCode || "ABCD0001234"}</p>
                        </div>
                        <div className="w-48 text-center pt-2">
                            {invoice.authorisedSignature ? (
                                <p className="text-xs font-bold text-slate-900 mb-1">{invoice.authorisedSignature}</p>
                            ) : null}
                            <div className="border-t border-slate-900 pt-1">
                                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Authorised Signature</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className="px-8 py-8 bg-slate-50 border-t border-slate-200 text-center">
                        <p className="text-slate-500 text-xs">
                            {footer.show && footer.text ? footer.text : "This is a digitally generated invoice."}
                        </p>
                        <p className="text-slate-700 text-[10px] mt-2 tracking-widest font-bold uppercase">
                            Shree Andal AI Software Solutions (OPC) Pvt Ltd
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicInvoiceView;

