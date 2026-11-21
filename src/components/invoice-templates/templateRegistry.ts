import { TemplateDefinition, TemplateConfig } from './types';

const BASE_CONFIG: Omit<TemplateConfig, 'layout' | 'design'> = {
  header: {
    showLogo: true,
    logoPosition: 'left',
    logoSize: 'medium',
    logoUrl: '',
    showCompanyName: true,
    showAddress: true,
    showPhone: true,
    showEmail: true
  },
  seller: {
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
      invoiceNumber: 'Invoice No.',
      invoiceDate: 'Invoice Date',
      dueDate: 'Due Date',
      paymentTerms: 'Payment Terms',
      orderNumber: 'Order No.',
      salespersonName: 'Salesperson'
    }
  },
  items: {
    columns: ['item', 'hsn', 'quantity', 'rate', 'discount', 'tax', 'amount'],
    labels: {
      item: 'Item Description',
      sku: 'SKU / Code',
      description: 'Details',
      hsn: 'HSN / SAC',
      quantity: 'Qty',
      rate: 'Unit Price',
      discount: 'Discount',
      tax: 'Tax',
      amount: 'Total'
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
  payment: {
    showPaidAmount: true,
    showBalance: true,
    showPaymentMethod: true
  },
  notes: {
    show: true,
    label: 'Notes & Instructions',
    defaultText: 'Thank you for your business! Please make payments to the designated bank account.'
  },
  terms: {
    show: true,
    label: 'Terms & Conditions',
    defaultText: 'Payment is due within 15 days of invoice date. Late payments are subject to a 1.5% fee.'
  },
  signature: {
    show: true,
    name: 'Authorized Signatory',
    designation: 'Finance Controller',
    imageUrl: ''
  },
  footer: {
    show: true,
    text: 'Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨.'
  },
  sectionsOrder: [
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

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  // 1. Modern Indigo (Original 1)
  {
    id: 'tpl-modern-indigo',
    layoutKey: 'modern-indigo',
    name: 'Modern Indigo',
    tagline: 'Clean corporate SaaS aesthetic',
    description: 'Sleek modern layout with indigo header banner, crisp card structures, and balanced typographic hierarchy.',
    category: 'Modern',
    isDefault: true,
    accentColors: {
      primary: '#4f46e5',
      secondary: '#f8fafc',
      border: '#cbd5e1'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'modern-indigo',
      design: {
        primaryColor: '#4f46e5',
        secondaryColor: '#f8fafc',
        textColor: '#0f172a',
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        fontFamily: 'Inter',
        fontSize: 12,
        headingSize: 20,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 8
      }
    }
  },

  // 2. Amber Gold Premium (Original 2)
  {
    id: 'tpl-amber-gold',
    layoutKey: 'amber-gold',
    name: 'Amber Gold Premium',
    tagline: 'Warm commercial and retail billing',
    description: 'Warm gold and amber accents suitable for retail, commercial bills, and prestige storefront receipts.',
    category: 'Corporate',
    accentColors: {
      primary: '#d97706',
      secondary: '#fffbeb',
      border: '#fde68a'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'amber-gold',
      invoiceInfo: {
        ...BASE_CONFIG.invoiceInfo,
        labels: {
          ...BASE_CONFIG.invoiceInfo.labels,
          invoiceNumber: 'Bill No.',
          invoiceDate: 'Bill Date'
        }
      },
      design: {
        primaryColor: '#d97706',
        secondaryColor: '#fffbeb',
        textColor: '#1c1917',
        backgroundColor: '#ffffff',
        borderColor: '#fde68a',
        fontFamily: 'Inter',
        fontSize: 12,
        headingSize: 20,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 8
      }
    }
  },

  // 3. Emerald Corporate (Original 3)
  {
    id: 'tpl-emerald-corporate',
    layoutKey: 'emerald-corporate',
    name: 'Emerald Corporate',
    tagline: 'High-trust B2B enterprise layout',
    description: 'Professional emerald green theme suitable for high-compliance enterprise B2B and institutional invoices.',
    category: 'Corporate',
    accentColors: {
      primary: '#059669',
      secondary: '#ecfdf5',
      border: '#a7f3d0'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'emerald-corporate',
      design: {
        primaryColor: '#059669',
        secondaryColor: '#ecfdf5',
        textColor: '#0f172a',
        backgroundColor: '#ffffff',
        borderColor: '#a7f3d0',
        fontFamily: 'Inter',
        fontSize: 12,
        headingSize: 20,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 6
      }
    }
  },

  // 4. Swiss Minimal (Template 4)
  {
    id: 'tpl-swiss-minimal',
    layoutKey: 'swiss-minimal',
    name: 'Swiss Minimal',
    tagline: 'Objective typography and generous whitespace',
    description: 'Stark white background, precise asymmetric alignment, black typography, and ultra-fine hairline dividers.',
    category: 'Minimal',
    accentColors: {
      primary: '#000000',
      secondary: '#f9fafb',
      border: '#e5e7eb'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'swiss-minimal',
      invoiceInfo: {
        ...BASE_CONFIG.invoiceInfo,
        labels: {
          ...BASE_CONFIG.invoiceInfo.labels,
          invoiceNumber: 'INVOICE REF',
          invoiceDate: 'ISSUED ON'
        }
      },
      design: {
        primaryColor: '#000000',
        secondaryColor: '#f9fafb',
        textColor: '#111827',
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: 11,
        headingSize: 24,
        bodySize: 11,
        borderStyle: 'light',
        cornerRadius: 0
      }
    }
  },

  // 5. Midnight Executive (Template 5)
  {
    id: 'tpl-midnight-executive',
    layoutKey: 'midnight-executive',
    name: 'Midnight Executive',
    tagline: 'Deep navy header with refined gold accents',
    description: 'Deep navy header banner, refined gold accents, and authoritative corporate ledger presentation for high-value clients.',
    category: 'Corporate',
    accentColors: {
      primary: '#0f172a',
      secondary: '#fafaf9',
      border: '#e2e8f0',
      gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'midnight-executive',
      design: {
        primaryColor: '#0f172a',
        secondaryColor: '#f8fafc',
        textColor: '#0f172a',
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        fontFamily: 'Inter',
        fontSize: 12,
        headingSize: 22,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 8
      }
    }
  },

  // 6. Modern Gradient (Template 6)
  {
    id: 'tpl-modern-gradient',
    layoutKey: 'modern-gradient',
    name: 'Modern Gradient',
    tagline: 'Vibrant blue-to-violet accent styling',
    description: 'Contemporary tech styling featuring smooth blue-to-violet gradients, rounded visual accents, and high-clarity output.',
    category: 'Modern',
    accentColors: {
      primary: '#2563eb',
      secondary: '#f5f3ff',
      border: '#ddd6fe',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'modern-gradient',
      design: {
        primaryColor: '#2563eb',
        secondaryColor: '#f5f3ff',
        textColor: '#0f172a',
        backgroundColor: '#ffffff',
        borderColor: '#ddd6fe',
        fontFamily: 'Poppins, Inter, sans-serif',
        fontSize: 12,
        headingSize: 20,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 12
      }
    }
  },

  // 7. Editorial / Luxury (Template 7)
  {
    id: 'tpl-editorial-luxury',
    layoutKey: 'editorial-luxury',
    name: 'Editorial / Luxury',
    tagline: 'Serif masthead and restrained monochrome charm',
    description: 'Editorial-style layout with serif typography, double hairline rules, and distinctive invoice numbering for luxury and consulting.',
    category: 'Luxury',
    accentColors: {
      primary: '#1c1917',
      secondary: '#fcfbf9',
      border: '#e7e5e4'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'editorial-luxury',
      invoiceInfo: {
        ...BASE_CONFIG.invoiceInfo,
        labels: {
          ...BASE_CONFIG.invoiceInfo.labels,
          invoiceNumber: 'FOLIO NO.',
          invoiceDate: 'DATE OF ISSUE'
        }
      },
      design: {
        primaryColor: '#1c1917',
        secondaryColor: '#fcfbf9',
        textColor: '#292524',
        backgroundColor: '#ffffff',
        borderColor: '#e7e5e4',
        fontFamily: 'Georgia, serif',
        fontSize: 11.5,
        headingSize: 22,
        bodySize: 11.5,
        borderStyle: 'light',
        cornerRadius: 4
      }
    }
  },

  // 8. Bold Creative (Template 8)
  {
    id: 'tpl-bold-creative',
    layoutKey: 'bold-creative',
    name: 'Bold Creative',
    tagline: 'Asymmetric geometry and high-contrast impact',
    description: 'Asymmetric dark carbon side spine, striking geometric accents, bold typography, and a high-impact total callout.',
    category: 'Creative',
    accentColors: {
      primary: '#ea580c',
      secondary: '#fff7ed',
      border: '#18181b'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'bold-creative',
      design: {
        primaryColor: '#ea580c',
        secondaryColor: '#fff7ed',
        textColor: '#18181b',
        backgroundColor: '#ffffff',
        borderColor: '#18181b',
        fontFamily: 'Inter',
        fontSize: 12,
        headingSize: 24,
        bodySize: 12,
        borderStyle: 'medium',
        cornerRadius: 4
      }
    }
  },

  // 9. Eco / Natural (Template 9)
  {
    id: 'tpl-eco-natural',
    layoutKey: 'eco-natural',
    name: 'Eco / Natural',
    tagline: 'Muted forest green and warm oat serenity',
    description: 'Muted forest green, warm cream canvas, gentle rounded panels, and clearly structured payment info for conscious brands.',
    category: 'Minimal',
    accentColors: {
      primary: '#2d5a43',
      secondary: '#fbf9f4',
      border: '#e3ded2'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'eco-natural',
      design: {
        primaryColor: '#2d5a43',
        secondaryColor: '#fbf9f4',
        textColor: '#1f2923',
        backgroundColor: '#ffffff',
        borderColor: '#e3ded2',
        fontFamily: 'Open Sans, Inter, sans-serif',
        fontSize: 12,
        headingSize: 20,
        bodySize: 12,
        borderStyle: 'light',
        cornerRadius: 10
      }
    }
  },

  // 10. Compact Business (Template 10)
  {
    id: 'tpl-compact-business',
    layoutKey: 'compact-business',
    name: 'Compact Business',
    tagline: 'High-density multi-item space efficiency',
    description: 'Space-efficient tabular layout with dense metadata grid, tight padding, and clear tax breakdown optimized for multi-item invoices.',
    category: 'Compact',
    accentColors: {
      primary: '#1e293b',
      secondary: '#f1f5f9',
      border: '#cbd5e1'
    },
    config: {
      ...BASE_CONFIG,
      layout: 'compact-business',
      design: {
        primaryColor: '#1e293b',
        secondaryColor: '#f8fafc',
        textColor: '#0f172a',
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        fontFamily: 'Inter',
        fontSize: 10.5,
        headingSize: 16,
        bodySize: 10.5,
        borderStyle: 'light',
        cornerRadius: 4
      }
    }
  }
];

export const getTemplateById = (id: string): TemplateDefinition | undefined => {
  return TEMPLATE_REGISTRY.find(t => t.id === id);
};

export const getTemplateByLayoutKey = (key: string): TemplateDefinition => {
  const found = TEMPLATE_REGISTRY.find(t => t.layoutKey === key);
  return found || TEMPLATE_REGISTRY[0];
};
