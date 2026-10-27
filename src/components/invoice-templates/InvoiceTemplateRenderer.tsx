import React from 'react';
import {
  TemplateLayoutKey,
  TemplateConfig,
  NormalizedInvoiceData,
  normalizeInvoiceData,
  getTemplateLayoutKey
} from './types';
import { getTemplateByLayoutKey } from './templateRegistry';

export interface InvoiceTemplateRendererProps {
  invoice: any;
  templateConfig?: Partial<TemplateConfig> | any;
  layoutKey?: TemplateLayoutKey;
  templateName?: string;
  className?: string;
  id?: string;
}

export const InvoiceTemplateRenderer: React.FC<InvoiceTemplateRendererProps> = ({
  invoice,
  templateConfig,
  layoutKey: explicitLayoutKey,
  templateName,
  className = '',
  id
}) => {
  // Resolve layout key from explicit prop, templateConfig, template snapshot, or name
  const resolvedKey: TemplateLayoutKey =
    explicitLayoutKey ||
    (templateConfig?.layout as TemplateLayoutKey) ||
    (invoice?.templateSnapshot?.layout as TemplateLayoutKey) ||
    getTemplateLayoutKey({
      name: templateName || invoice?.templateSnapshot?.name || invoice?.templateName,
      config: templateConfig || invoice?.templateSnapshot
    });

  const defaultTemplateDef = getTemplateByLayoutKey(resolvedKey);

  // Deep merge template default configuration with provided configuration overrides
  const config: TemplateConfig = {
    ...defaultTemplateDef.config,
    ...templateConfig,
    layout: resolvedKey,
    design: {
      ...defaultTemplateDef.config.design,
      ...(templateConfig?.design || {})
    },
    header: {
      ...defaultTemplateDef.config.header,
      ...(templateConfig?.header || {})
    },
    seller: {
      ...defaultTemplateDef.config.seller,
      ...(templateConfig?.seller || {})
    },
    customer: {
      ...defaultTemplateDef.config.customer,
      ...(templateConfig?.customer || {})
    },
    invoiceInfo: {
      ...defaultTemplateDef.config.invoiceInfo,
      ...(templateConfig?.invoiceInfo || {}),
      labels: {
        ...defaultTemplateDef.config.invoiceInfo.labels,
        ...(templateConfig?.invoiceInfo?.labels || {})
      }
    },
    items: {
      ...defaultTemplateDef.config.items,
      ...(templateConfig?.items || {}),
      labels: {
        ...defaultTemplateDef.config.items.labels,
        ...(templateConfig?.items?.labels || {})
      }
    },
    tax: {
      ...defaultTemplateDef.config.tax,
      ...(templateConfig?.tax || {})
    },
    payment: {
      ...defaultTemplateDef.config.payment,
      ...(templateConfig?.payment || {})
    },
    notes: {
      ...defaultTemplateDef.config.notes,
      ...(templateConfig?.notes || {})
    },
    terms: {
      ...defaultTemplateDef.config.terms,
      ...(templateConfig?.terms || {})
    },
    signature: {
      ...defaultTemplateDef.config.signature,
      ...(templateConfig?.signature || {})
    },
    footer: {
      ...defaultTemplateDef.config.footer,
      ...(templateConfig?.footer || {})
    },
    sectionsOrder: templateConfig?.sectionsOrder || defaultTemplateDef.config.sectionsOrder || [
      'header',
      'customer',
      'invoiceInfo',
      'items',
      'tax',
      'payment',
      'notes',
      'terms',
      'signature',
      'footer'
    ]
  };

  const data: NormalizedInvoiceData = normalizeInvoiceData(invoice);

  const primaryColor = config.design.primaryColor || '#4f46e5';
  const secondaryColor = config.design.secondaryColor || '#f8fafc';
  const textColor = config.design.textColor || '#0f172a';
  const borderColor = config.design.borderColor || '#cbd5e1';
  const backgroundColor = config.design.backgroundColor || '#ffffff';
  const fontFamily = config.design.fontFamily || 'Inter, sans-serif';
  const fontSize = `${config.design.fontSize || 12}px`;
  const cornerRadius = `${config.design.cornerRadius || 0}px`;
  const borderStyle = config.design.borderStyle || 'light';

  const containerBorderWidth = borderStyle === 'none' ? '0px' : borderStyle === 'medium' ? '2px' : '1px';
  const containerBorderStyle = borderStyle === 'none' ? 'none' : 'solid';

  return (
    <div
      id={id}
      className={`invoice-template-container w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-12 shadow-2xl relative border mx-auto overflow-x-auto text-left transition-all ${className}`}
      style={{
        backgroundColor,
        borderColor,
        borderWidth: containerBorderWidth,
        borderStyle: containerBorderStyle,
        color: textColor,
        fontFamily,
        fontSize,
        lineHeight: '1.5',
        borderRadius: cornerRadius
      }}
    >
      {config.sectionsOrder.map((sectionName: string) => {
        // ── 1. HEADER ──
        if (sectionName === 'header') {
          return (
            <div
              key="header"
              className={`mb-6 flex ${
                config.header.logoPosition === 'center'
                  ? 'flex-col items-center text-center gap-3'
                  : config.header.logoPosition === 'right'
                  ? 'flex-row-reverse justify-between items-start gap-4'
                  : 'justify-between items-start gap-4'
              }`}
            >
              {config.header.showLogo && (
                <div className="mb-2">
                  {config.header.logoUrl ? (
                    <img
                      src={config.header.logoUrl}
                      alt="Logo"
                      className={`object-contain ${
                        config.header.logoSize === 'small'
                          ? 'h-10 w-24'
                          : config.header.logoSize === 'large'
                          ? 'h-20 w-44'
                          : 'h-14 w-32'
                      }`}
                    />
                  ) : (
                    <div
                      className={`bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs font-bold rounded-lg ${
                        config.header.logoSize === 'small'
                          ? 'h-10 w-24'
                          : config.header.logoSize === 'large'
                          ? 'h-20 w-44'
                          : 'h-14 w-32'
                      }`}
                      style={{ borderRadius: cornerRadius }}
                    >
                      [ Company Logo ]
                    </div>
                  )}
                </div>
              )}

              <div
                className={`max-w-md ${
                  config.header.logoPosition === 'right'
                    ? 'text-left'
                    : config.header.logoPosition === 'center'
                    ? 'text-center'
                    : 'text-right'
                }`}
              >
                {config.header.showCompanyName && (
                  <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: primaryColor }}>
                    {data.sellerName}
                  </h2>
                )}
                {config.header.showAddress && data.sellerAddress && (
                  <p className="text-slate-500 text-xs mt-1 whitespace-pre-line">{data.sellerAddress}</p>
                )}
                {config.header.showPhone && data.sellerPhone && (
                  <p className="text-slate-500 text-xs mt-0.5">Phone: {data.sellerPhone}</p>
                )}
                {config.header.showEmail && data.sellerEmail && (
                  <p className="text-slate-500 text-xs mt-0.5">Email: {data.sellerEmail}</p>
                )}
                {config.seller?.showGSTIN && data.sellerGSTIN && (
                  <p className="text-xs font-bold mt-1 font-mono" style={{ color: primaryColor }}>
                    GSTIN: {data.sellerGSTIN}
                  </p>
                )}
              </div>
            </div>
          );
        }

        // ── 2. SELLER (Optional standalone box) ──
        if (sectionName === 'seller' && config.seller?.showName) {
          return (
            <div
              key="seller"
              className="mb-6 p-4 rounded-xl border text-left"
              style={{
                backgroundColor: secondaryColor,
                borderColor,
                borderRadius: cornerRadius
              }}
            >
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Seller Details</h4>
              <p className="font-extrabold text-sm">{data.sellerName}</p>
              {config.seller.showAddress && data.sellerAddress && (
                <p className="text-slate-600 text-xs mt-0.5">{data.sellerAddress}</p>
              )}
              {config.seller.showPhone && data.sellerPhone && (
                <p className="text-slate-600 text-xs">Phone: {data.sellerPhone}</p>
              )}
              {config.seller.showEmail && data.sellerEmail && (
                <p className="text-slate-600 text-xs">Email: {data.sellerEmail}</p>
              )}
              {config.seller.showGSTIN && data.sellerGSTIN && (
                <p className="text-xs font-bold mt-1 font-mono" style={{ color: primaryColor }}>
                  GSTIN: {data.sellerGSTIN}
                </p>
              )}
            </div>
          );
        }

        // ── 3. CUSTOMER ──
        if (sectionName === 'customer') {
          return (
            <div key="customer" className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Billed To</h4>
                {config.customer.showName && <p className="font-bold text-sm text-slate-950">{data.customerName}</p>}
                {config.customer.showBillingAddress && data.customerAddress && (
                  <p className="text-slate-600 text-xs mt-0.5 whitespace-pre-line">{data.customerAddress}</p>
                )}
                {config.customer.showPhone && data.customerPhone && (
                  <p className="text-slate-600 text-xs mt-0.5">Phone: {data.customerPhone}</p>
                )}
                {config.customer.showEmail && data.customerEmail && (
                  <p className="text-slate-600 text-xs mt-0.5">Email: {data.customerEmail}</p>
                )}
              </div>
              <div className="sm:text-right">
                {config.customer.showGSTIN && data.customerGSTIN && (
                  <p className="text-xs font-bold text-slate-900 mt-2 sm:mt-6">
                    Customer GSTIN:{' '}
                    <span className="font-mono" style={{ color: primaryColor }}>
                      {data.customerGSTIN}
                    </span>
                  </p>
                )}
                {config.customer.showPlaceOfSupply && data.stateOfSupply && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    Place of Supply: <span className="font-medium text-slate-900">{data.stateOfSupply}</span>
                  </p>
                )}
              </div>
            </div>
          );
        }

        // ── 4. INVOICE INFO ──
        if (sectionName === 'invoiceInfo') {
          return (
            <div
              key="invoiceInfo"
              className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border bg-white text-left"
              style={{
                borderColor,
                borderRadius: cornerRadius
              }}
            >
              {config.invoiceInfo?.showInvoiceNumber && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.invoiceNumber || 'Invoice No.'}
                  </p>
                  <p className="font-extrabold text-sm font-mono" style={{ color: primaryColor }}>
                    #{data.invoiceNumber}
                  </p>
                </div>
              )}
              {config.invoiceInfo?.showInvoiceDate && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.invoiceDate || 'Invoice Date'}
                  </p>
                  <p className="font-bold text-slate-900">{data.invoiceDate}</p>
                </div>
              )}
              {config.invoiceInfo?.showDueDate && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.dueDate || 'Due Date'}
                  </p>
                  <p className="font-bold text-slate-900">{data.dueDate || data.invoiceDate}</p>
                </div>
              )}
              {config.invoiceInfo?.showPaymentTerms && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.paymentTerms || 'Payment Terms'}
                  </p>
                  <p className="text-slate-700">{data.paymentTerms || 'Net 15 Days'}</p>
                </div>
              )}
              {config.invoiceInfo?.showOrderNumber && data.orderNumber && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.orderNumber || 'Order No.'}
                  </p>
                  <p className="font-mono text-slate-800">{data.orderNumber}</p>
                </div>
              )}
              {config.invoiceInfo?.showSalesperson && data.salespersonName && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {config.invoiceInfo.labels?.salespersonName || 'Salesperson'}
                  </p>
                  <p className="text-slate-800">{data.salespersonName}</p>
                </div>
              )}
            </div>
          );
        }

        // ── 5. ITEMS TABLE ──
        if (sectionName === 'items') {
          const columns = config.items?.columns || ['item', 'hsn', 'quantity', 'rate', 'discount', 'tax', 'amount'];
          const labels = config.items?.labels || {};

          return (
            <div key="items" className="mb-6 overflow-x-auto">
              <table
                className={`w-full text-left border-collapse ${
                  borderStyle === 'light' ? 'border' : borderStyle === 'medium' ? 'border-2' : 'border-none'
                }`}
                style={{ borderColor }}
              >
                <thead>
                  <tr className="text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>
                    <th className="py-2.5 px-3">#</th>
                    {columns.map((col: string) => (
                      <th key={col} className="py-2.5 px-3 text-left">
                        {(labels as any)[col] || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-6 text-center text-slate-400 text-xs">
                        No line items added yet.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className="border-b text-xs hover:bg-slate-50 transition-colors"
                        style={{
                          borderColor,
                          backgroundColor: idx % 2 === 1 ? secondaryColor : 'transparent'
                        }}
                      >
                        <td className="py-3 px-3 font-semibold text-slate-500">{idx + 1}</td>
                        {columns.map((col: string) => {
                          if (col === 'item') {
                            return (
                              <td key={col} className="py-3 px-3 font-bold text-left text-slate-950">
                                {item.name}
                                {item.code && <p className="text-[10px] text-slate-500 font-normal">Code: {item.code}</p>}
                              </td>
                            );
                          }
                          if (col === 'description') {
                            return (
                              <td key={col} className="py-3 px-3 text-slate-500 text-[11px] text-left">
                                {item.description || '-'}
                              </td>
                            );
                          }
                          if (col === 'sku') {
                            return (
                              <td key={col} className="py-3 px-3 text-slate-650 text-left font-mono">
                                {item.sku || item.code || '-'}
                              </td>
                            );
                          }
                          if (col === 'hsn') {
                            return (
                              <td key={col} className="py-3 px-3 text-left font-mono">
                                {item.hsn || '-'}
                              </td>
                            );
                          }
                          if (col === 'quantity') {
                            return (
                              <td key={col} className="py-3 px-3 text-left">
                                {item.quantity} {item.unit || 'Pcs'}
                              </td>
                            );
                          }
                          if (col === 'rate') {
                            return (
                              <td key={col} className="py-3 px-3 text-left font-mono">
                                ₹{item.unitPrice.toFixed(2)}
                              </td>
                            );
                          }
                          if (col === 'discount') {
                            return (
                              <td key={col} className="py-3 px-3 text-left text-amber-700 font-medium">
                                {item.discountPercent
                                  ? `${item.discountPercent}%`
                                  : item.discountAmount
                                  ? `₹${item.discountAmount.toFixed(2)}`
                                  : '0%'}
                              </td>
                            );
                          }
                          if (col === 'tax') {
                            return (
                              <td key={col} className="py-3 px-3 text-left">
                                {item.taxPercent}% GST
                              </td>
                            );
                          }
                          if (col === 'amount') {
                            return (
                              <td key={col} className="py-3 px-3 font-bold text-slate-950 text-left font-mono">
                                ₹{item.total.toFixed(2)}
                              </td>
                            );
                          }
                          return (
                            <td key={col} className="text-left">
                              -
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          );
        }

        // ── 6. TAX & TOTALS ──
        if (sectionName === 'tax' && config.tax?.showSummary) {
          return (
            <div key="tax" className="mb-6 flex justify-end">
              <div className="w-80 space-y-2 border-t pt-3" style={{ borderColor }}>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold font-mono">₹{data.subtotal.toFixed(2)}</span>
                </div>
                {data.totalDiscount > 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-700">
                    <span>Total Discount</span>
                    <span className="font-mono">-₹{data.totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                {config.tax.showTaxableAmount && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Taxable Amount</span>
                    <span className="font-mono">₹{data.subtotal.toFixed(2)}</span>
                  </div>
                )}
                {config.tax.showCGST && data.cgst > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-650">
                    <span>CGST</span>
                    <span className="font-mono">₹{data.cgst.toFixed(2)}</span>
                  </div>
                )}
                {config.tax.showSGST && data.sgst > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-650">
                    <span>SGST</span>
                    <span className="font-mono">₹{data.sgst.toFixed(2)}</span>
                  </div>
                )}
                {config.tax.showIGST && data.igst > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-650">
                    <span>IGST</span>
                    <span className="font-mono">₹{data.igst.toFixed(2)}</span>
                  </div>
                )}
                {config.tax.showTotalTax && (
                  <div className="flex justify-between items-center text-xs border-t pt-1.5 font-bold" style={{ borderColor }}>
                    <span className="text-slate-650">Total Tax</span>
                    <span className="font-mono">₹{data.totalTax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-t" style={{ borderColor }}>
                  <span className="font-extrabold text-slate-900">Grand Total</span>
                  <span className="text-base font-black font-mono" style={{ color: primaryColor }}>
                    ₹{data.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        }

        // ── 7. PAYMENT & REMITTANCE ──
        if (sectionName === 'payment') {
          return (
            <div
              key="payment"
              className="mb-6 p-4 border text-left space-y-3"
              style={{
                backgroundColor: secondaryColor,
                borderColor,
                borderRadius: cornerRadius
              }}
            >
              <div className="grid grid-cols-3 gap-2 text-xs">
                {config.payment?.showPaidAmount && (
                  <div>
                    <span className="text-slate-500 block">Amount Paid</span>
                    <span className="font-bold text-emerald-600 font-mono">₹{(data.paidAmount || 0).toFixed(2)}</span>
                  </div>
                )}
                {config.payment?.showBalance && (
                  <div>
                    <span className="text-slate-500 block">Balance Due</span>
                    <span className="font-black text-rose-600 font-mono">₹{data.balanceDue.toFixed(2)}</span>
                  </div>
                )}
                {config.payment?.showPaymentMethod && (
                  <div>
                    <span className="text-slate-500 block">Payment Method</span>
                    <span className="text-slate-700 capitalize font-medium">{data.paymentMethod || 'Cash'}</span>
                  </div>
                )}
              </div>

              {(data.bankName || data.accountNumber) && (
                <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-650">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    BANKING DETAILS / REMITTANCE ADVICE
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[9px]">Bank Name</span>
                      <span className="font-medium text-slate-800">{data.bankName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Account Type</span>
                      <span className="font-medium text-slate-800">{data.accountType || 'Current'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Account Number</span>
                      <span className="font-mono font-medium text-slate-800">{data.accountNumber}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">IFSC Code</span>
                      <span className="font-mono font-medium text-slate-800">{data.ifscCode}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        // ── 8. NOTES ──
        if (sectionName === 'notes' && config.notes?.show) {
          const notesText = data.notes || config.notes.defaultText;
          if (!notesText) return null;
          return (
            <div key="notes" className="mb-6 text-left">
              <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                {config.notes.label || 'Notes'}
              </h5>
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{notesText}</p>
            </div>
          );
        }

        // ── 9. TERMS ──
        if (sectionName === 'terms' && config.terms?.show) {
          const termsText = data.termsAndConditions || config.terms.defaultText;
          if (!termsText) return null;
          return (
            <div key="terms" className="mb-6 text-left">
              <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                {config.terms.label || 'Terms & Conditions'}
              </h5>
              <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{termsText}</p>
            </div>
          );
        }

        // ── 10. SIGNATURE ──
        if (sectionName === 'signature') {
          return (
            <div key="signature" className="mb-6 flex flex-col items-end">
              <div className="text-center w-48 mt-4">
                {config.signature?.imageUrl ? (
                  <img
                    src={config.signature.imageUrl}
                    alt="Signature"
                    className="h-10 object-contain mx-auto mb-1.5"
                  />
                ) : null}
                <div className="border-t pt-1 border-slate-900">
                  {data.authorisedSignature ? (
                    <p className="font-bold text-xs text-slate-900 mb-0.5">{data.authorisedSignature}</p>
                  ) : null}
                  <p className="font-bold text-xs text-slate-900 uppercase tracking-wider">Authorised Signature</p>
                  {config.signature?.designation && (
                    <p className="text-[10px] text-slate-500">{config.signature.designation}</p>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // ── 11. FOOTER ──
        if (sectionName === 'footer' && config.footer?.show) {
          return (
            <div
              key="footer"
              className="mt-12 pt-4 border-t text-center text-[10px] text-slate-450"
              style={{ borderColor }}
            >
              <p className="leading-relaxed">
                {config.footer.text || 'This is a digitally generated invoice. No signature required.'}
              </p>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
