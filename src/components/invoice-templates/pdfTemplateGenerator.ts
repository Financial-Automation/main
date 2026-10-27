import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  TemplateLayoutKey,
  NormalizedInvoiceData,
  normalizeInvoiceData,
  getTemplateLayoutKey
} from "./types";
import { getTemplateByLayoutKey } from "./templateRegistry";

interface PDFGeneratorOptions {
  action?: 'save' | 'print' | 'blob';
  filename?: string;
}

export const generateTemplateInvoicePDF = (
  rawInvoice: any,
  rawConfig?: any,
  explicitLayout?: TemplateLayoutKey,
  options: PDFGeneratorOptions = { action: 'print' }
): { doc: jsPDF; blobURL?: string } => {
  const data: NormalizedInvoiceData = normalizeInvoiceData(rawInvoice);

  const resolvedLayout: TemplateLayoutKey =
    explicitLayout ||
    (rawConfig?.layout as TemplateLayoutKey) ||
    (rawInvoice?.templateSnapshot?.layout as TemplateLayoutKey) ||
    getTemplateLayoutKey({
      name: rawInvoice?.templateSnapshot?.name || rawInvoice?.templateName,
      config: rawConfig || rawInvoice?.templateSnapshot
    });

  const templateDef = getTemplateByLayoutKey(resolvedLayout);
  const config = {
    ...templateDef.config,
    ...rawConfig,
    layout: resolvedLayout
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = (hex || "#4f46e5").replace("#", "");
    const num = parseInt(clean.padEnd(6, "0"), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const primaryRgb = hexToRgb(config.design?.primaryColor || templateDef.accentColors.primary);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const fontFamily = resolvedLayout === 'editorial-luxury' ? 'times' : 'helvetica';
  doc.setFont(fontFamily, 'normal');

  let currentY = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin;

  // Header Rendering based on layout
  if (resolvedLayout === 'swiss-minimal') {
    // Stark Swiss Minimalist Header
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 0, 0);
    doc.text("INVOICE", leftMargin, currentY + 8);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`REF #${data.invoiceNumber}`, leftMargin, currentY + 14);

    // Seller details on right
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(data.sellerName.toUpperCase(), rightMargin, currentY + 4, { align: "right" });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    let sY = currentY + 9;
    if (data.sellerAddress) {
      const lines = doc.splitTextToSize(data.sellerAddress, 80);
      lines.forEach((l: string) => {
        doc.text(l, rightMargin, sY, { align: "right" });
        sY += 3.5;
      });
    }
    if (data.sellerPhone) {
      doc.text(`T: ${data.sellerPhone}`, rightMargin, sY, { align: "right" });
      sY += 3.5;
    }
    if (data.sellerGSTIN) {
      doc.text(`TAX ID: ${data.sellerGSTIN}`, rightMargin, sY, { align: "right" });
      sY += 3.5;
    }

    currentY = Math.max(sY + 4, currentY + 24);
    // 1px black divider
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += 8;

  } else if (resolvedLayout === 'midnight-executive') {
    // Deep Midnight Navy Block
    doc.setFillColor(15, 23, 42); // slate-950
    doc.rect(0, 0, pageWidth, 42, 'F');

    // Gold divider line
    doc.setFillColor(217, 119, 6); // amber-600
    doc.rect(0, 42, pageWidth, 1.5, 'F');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(245, 158, 11); // amber-400
    doc.text("EXECUTIVE TAX INVOICE • CONFIDENTIAL", leftMargin, 12);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(data.sellerName.toUpperCase(), leftMargin, 19);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // slate-300
    if (data.sellerAddress) {
      doc.text(data.sellerAddress.substring(0, 80), leftMargin, 24);
    }
    if (data.sellerGSTIN) {
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(245, 158, 11);
      doc.text(`CORP GSTIN: ${data.sellerGSTIN}`, leftMargin, 29);
    }

    // Invoice Ref on right
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(245, 158, 11);
    doc.text("INVOICE NUMBER", rightMargin, 12, { align: 'right' });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(`#${data.invoiceNumber}`, rightMargin, 20, { align: 'right' });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Issue Date: ${data.invoiceDate}`, rightMargin, 26, { align: 'right' });
    if (data.dueDate) {
      doc.setTextColor(245, 158, 11);
      doc.text(`Due Date: ${data.dueDate}`, rightMargin, 31, { align: 'right' });
    }

    currentY = 50;

  } else if (resolvedLayout === 'editorial-luxury') {
    // Editorial Classic Double Top Rules
    doc.setDrawColor(28, 25, 23);
    doc.setLineWidth(0.8);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    doc.setLineWidth(0.2);
    doc.line(leftMargin, currentY + 1.5, rightMargin, currentY + 1.5);
    currentY += 8;

    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text("FINANCIAL FOLIO", leftMargin, currentY);

    doc.setFont('times', 'italic');
    doc.setFontSize(22);
    doc.setTextColor(28, 25, 23);
    doc.text("Invoice Statement", leftMargin, currentY + 7);

    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Folio № ${data.invoiceNumber}`, leftMargin, currentY + 13);

    // Issuer on right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(28, 25, 23);
    doc.text(data.sellerName.toUpperCase(), rightMargin, currentY + 2, { align: 'right' });

    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    let ey = currentY + 7;
    if (data.sellerAddress) {
      doc.text(data.sellerAddress.substring(0, 80), rightMargin, ey, { align: 'right' });
      ey += 4;
    }
    if (data.sellerGSTIN) {
      doc.text(`Tax Reg: ${data.sellerGSTIN}`, rightMargin, ey, { align: 'right' });
      ey += 4;
    }

    currentY = Math.max(ey + 4, currentY + 20);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += 8;

  } else if (resolvedLayout === 'bold-creative') {
    // Bold Creative Asymmetric Accent Header
    // Vertical left stripe
    doc.setFillColor(234, 88, 12); // energetic orange
    doc.rect(0, 0, 6, pageHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(234, 88, 12);
    doc.text("STUDIO INVOICE /// CREATIVE BILLING", leftMargin, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(24, 24, 27);
    doc.text("INVOICE", leftMargin, currentY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(234, 88, 12);
    doc.text(`REF #${data.invoiceNumber}`, leftMargin, currentY + 14);

    // Company info on right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(data.sellerName.toUpperCase(), rightMargin, currentY + 3, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    let by = currentY + 8;
    if (data.sellerAddress) {
      doc.text(data.sellerAddress.substring(0, 80), rightMargin, by, { align: 'right' });
      by += 4;
    }
    if (data.sellerGSTIN) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(24, 24, 27);
      doc.text(`GSTIN: ${data.sellerGSTIN}`, rightMargin, by, { align: 'right' });
      by += 4;
    }

    currentY = Math.max(by + 4, currentY + 22);
    doc.setDrawColor(24, 24, 27);
    doc.setLineWidth(1);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += 8;

  } else {
    // Standard Banner Header (Modern Indigo, Amber Gold, Emerald Corporate, Modern Gradient, Eco Natural, Compact Business)
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.rect(0, 0, pageWidth, 36, 'F');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("OFFICIAL TAX INVOICE", leftMargin, 11);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(15);
    doc.text(data.sellerName.toUpperCase(), leftMargin, 18);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(240, 240, 240);
    if (data.sellerAddress) {
      doc.text(data.sellerAddress.substring(0, 80), leftMargin, 23);
    }
    if (data.sellerGSTIN) {
      doc.text(`GSTIN: ${data.sellerGSTIN}`, leftMargin, 28);
    }

    // Invoice Ref on Right
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(240, 240, 240);
    doc.text("INVOICE NO", rightMargin, 11, { align: 'right' });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(`#${data.invoiceNumber}`, rightMargin, 18, { align: 'right' });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.text(`Date: ${data.invoiceDate}`, rightMargin, 24, { align: 'right' });
    if (data.dueDate) {
      doc.text(`Due: ${data.dueDate}`, rightMargin, 29, { align: 'right' });
    }

    currentY = 44;
  }

  // Client Details Section
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text("BILLED TO / CUSTOMER", leftMargin, currentY);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.customerName, leftMargin, currentY + 5);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  let cY = currentY + 9;
  if (data.customerAddress) {
    const addrLines = doc.splitTextToSize(data.customerAddress, 90);
    addrLines.forEach((l: string) => {
      doc.text(l, leftMargin, cY);
      cY += 3.5;
    });
  }
  if (data.customerPhone) {
    doc.text(`Phone: ${data.customerPhone}`, leftMargin, cY);
    cY += 3.5;
  }
  if (data.customerEmail) {
    doc.text(`Email: ${data.customerEmail}`, leftMargin, cY);
    cY += 3.5;
  }
  if (data.customerGSTIN) {
    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.text(`Customer GSTIN: ${data.customerGSTIN}`, leftMargin, cY);
    cY += 3.5;
  }

  // Metadata block on right
  let rY = currentY + 5;
  const drawMetaRow = (label: string, value: string) => {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, 130, rY);

    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(value, rightMargin, rY, { align: 'right' });
    rY += 4.5;
  };

  if (data.paymentTerms) drawMetaRow("Payment Terms:", data.paymentTerms);
  if (data.orderNumber) drawMetaRow("Order Reference:", data.orderNumber);
  if (data.stateOfSupply) drawMetaRow("Place of Supply:", data.stateOfSupply);
  if (data.salespersonName) drawMetaRow("Sales Rep:", data.salespersonName);
  if (data.eWayBillNo) drawMetaRow("e-Way Bill:", data.eWayBillNo);

  currentY = Math.max(cY + 5, rY + 5);

  // Items Table
  const tableHead = [
    ["#", "Item Description", "HSN/SAC", "Qty", "Rate", ...(data.totalDiscount > 0 ? ["Discount"] : []), "Tax %", "Total (INR)"]
  ];

  const tableBody = data.items.map((item, idx) => {
    const row = [
      String(idx + 1),
      item.description ? `${item.name}\n${item.description}` : item.name,
      item.hsn || "-",
      `${item.quantity} ${item.unit || 'Pcs'}`,
      item.unitPrice.toFixed(2),
      ...(data.totalDiscount > 0 ? [item.discountAmount > 0 ? `-${item.discountAmount.toFixed(2)}` : "-"] : []),
      `${item.taxPercent}%`,
      item.total.toFixed(2)
    ];
    return row;
  });

  const isSwiss = resolvedLayout === 'swiss-minimal';
  const isCompact = resolvedLayout === 'compact-business';

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: tableBody,
    theme: isSwiss ? 'plain' : 'striped',
    styles: {
      font: fontFamily,
      fontSize: isCompact ? 7.5 : 8.5,
      cellPadding: isCompact ? 1.5 : 2.5,
      textColor: [15, 23, 42]
    },
    headStyles: {
      fillColor: isSwiss ? [255, 255, 255] : primaryRgb,
      textColor: isSwiss ? [0, 0, 0] : [255, 255, 255],
      fontStyle: 'bold',
      lineColor: isSwiss ? [0, 0, 0] : primaryRgb,
      lineWidth: isSwiss ? 0.3 : 0
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      ...(data.totalDiscount > 0 ? { 5: { cellWidth: 20, halign: 'right' } } : {}),
      [data.totalDiscount > 0 ? 6 : 5]: { cellWidth: 16, halign: 'center' },
      [data.totalDiscount > 0 ? 7 : 6]: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: leftMargin, right: leftMargin }
  });

  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 40)) + 6;

  // Check if page overflow
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Summary Totals
  const sumLeft = 130;
  const drawTotalRow = (label: string, value: string, isBold = false) => {
    doc.setFont(fontFamily, isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 9.5 : 8);
    doc.setTextColor(isBold ? primaryRgb[0] : 80, isBold ? primaryRgb[1] : 80, isBold ? primaryRgb[2] : 80);
    doc.text(label, sumLeft, currentY);
    doc.text(value, rightMargin, currentY, { align: 'right' });
    currentY += 4.5;
  };

  drawTotalRow("Subtotal:", `INR ${data.subtotal.toFixed(2)}`);
  if (data.totalDiscount > 0) drawTotalRow("Discount:", `-INR ${data.totalDiscount.toFixed(2)}`);
  if (data.cgst > 0) drawTotalRow("CGST:", `INR ${data.cgst.toFixed(2)}`);
  if (data.sgst > 0) drawTotalRow("SGST:", `INR ${data.sgst.toFixed(2)}`);
  if (data.igst > 0) drawTotalRow("IGST:", `INR ${data.igst.toFixed(2)}`);
  if (data.shippingCharges > 0) drawTotalRow("Shipping:", `INR ${data.shippingCharges.toFixed(2)}`);

  // Grand Total Box
  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.rect(sumLeft - 4, currentY - 3, (rightMargin - sumLeft) + 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("GRAND TOTAL:", sumLeft, currentY + 2);
  doc.text(`INR ${data.grandTotal.toFixed(2)}`, rightMargin, currentY + 2, { align: 'right' });
  currentY += 10;

  if (data.paidAmount > 0) {
    drawTotalRow("Amount Paid:", `INR ${data.paidAmount.toFixed(2)}`);
  }
  drawTotalRow("Balance Due:", `INR ${data.balanceDue.toFixed(2)}`, true);
  currentY += 4;

  // Banking & Payment Details
  if (currentY > 245) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftMargin, currentY, contentWidth, 16, 2, 2, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("REMITTANCE ADVICE / BANK DETAILS", leftMargin + 3, currentY + 4.5);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const bankDetails = `Bank: ${data.bankName || 'HDFC Bank'}   |   A/C: ${data.accountNumber || 'XXXXXXXX'} (${data.accountType || 'Current'})   |   IFSC: ${data.ifscCode || 'HDFC0001234'}   |   Mode: ${data.paymentMethod || 'Wire'}`;
  doc.text(bankDetails, leftMargin + 3, currentY + 10.5);

  currentY += 22;

  // Notes & Sign-off
  if (data.notes) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text("Notes:", leftMargin, currentY);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.text(data.notes.substring(0, 120), leftMargin, currentY + 4);
  }

  // Signature on Right
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(data.authorisedSignature || "Authorized Signatory", rightMargin - 15, currentY + 4, { align: 'center' });
  doc.setDrawColor(150, 150, 150);
  doc.line(rightMargin - 35, currentY + 6, rightMargin + 5, currentY + 6);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7);
  doc.text("Signature & Seal", rightMargin - 15, currentY + 9.5, { align: 'center' });

  // Footer text
  doc.setFont(fontFamily, 'italic');
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    config.footer?.text || "This is a computer generated invoice. No signature required.",
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

  // Action handling
  if (options.action === 'save') {
    doc.save(options.filename || `invoice_${data.invoiceNumber}.pdf`);
    return { doc };
  } else if (options.action === 'blob') {
    const pdfBlob = doc.output('blob');
    const blobURL = URL.createObjectURL(pdfBlob);
    return { doc, blobURL };
  } else {
    // print preview
    const pdfBlob = doc.output('blob');
    const blobURL = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(blobURL);
    if (!printWindow) {
      doc.save(options.filename || `invoice_${data.invoiceNumber}.pdf`);
    }
    return { doc, blobURL };
  }
};
