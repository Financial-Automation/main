/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Package, Search, Archive, ShoppingCart, Loader2, Shield, Mic, Save, FileText, Calculator, IndianRupee, AlertCircle, Download, Printer, Copy, MessageCircle, Share2, Layout, Check, Edit, Edit3, Star, Palette, Eye, Settings, Sliders, Building2, User, PenTool, FolderOpen, Image as ImageIcon, CheckCircle, Calendar } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseVoiceInventoryText } from "@/lib/voiceInventoryParser";
import { API_BASE_URL } from "@/lib/api";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InventoryItem {
    _id?: string;
    itemName: string;
    sku: string;
    hsnCode?: string;
    quantity: number;
    unit: string;
    price: number;
    category: string;
    gstRate?: number;
    sgst?: number;
    cgst?: number;
    igst?: number;
    lastUpdated?: Date;
    stateOfSupply: string;
}

interface SaleItem {
    _id: string;
    itemName: string;
    sku: string;
    quantitySold: number;
    unitPrice: number;
    subtotal: number;
    sgstRate: number;
    cgstRate: number;
    igstRate: number;
    sgstAmount: number;
    cgstAmount: number;
    igstAmount: number;
    gstRate: number;
    gstAmount: number;
    grandTotal: number;
    saleDate: Date;
    stateOfSupply: string;
}

interface PurchaseItem {
    id: string;
    itemName: string;
    itemCode: string;
    codeType: 'HSN' | 'SAC';
    hsnCode: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    priceWithTax: boolean;
    discountPercent: number;
    discountAmount: number;
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

interface PurchaseInvoice {
    type: 'purchase';
    customerType: 'B2B' | 'B2C';
    customerName: string;
    customerPhone: string;
    customerGstin: string;
    supplierName: string;
    phone: string;
    gstin: string;
    billNo: string;
    billDate: string;
    paymentMethod: 'Cash' | 'Credit' | 'G Pay' | 'Net Banking';
    invoiceSize: 'A4' | 'A5';
    invoiceFormat: 'Supermarket' | 'Hotel' | 'Stationery Shop';
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
}

const BUSINESS_STATE = "Tamil Nadu";

const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const Inventory = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("items");
    const [activeSubTab, setActiveSubTab] = useState<"instock" | "sold">("instock");

    const [items, setItems] = useState<InventoryItem[]>([]);
    const [sales, setSales] = useState<SaleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Custom Category State
    const [customCategories, setCustomCategories] = useState<{ _id: string, name: string }[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [isSavingCategory, setIsSavingCategory] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
    const [isCategoryDeleteDialogOpen, setIsCategoryDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [isItemDeleteDialogOpen, setIsItemDeleteDialogOpen] = useState(false);

    // Sell Dialog State
    const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [sellQuantity, setSellQuantity] = useState("1");
    const [sellStateOfSupply, setSellStateOfSupply] = useState("");
    const [isSelling, setIsSelling] = useState(false);

    // GST Rate Options
    const GST_SLABS = ["0", "5", "12", "18", "28"];
    const UNITS = ["Pcs", "Kg", "Ltr", "Mtr", "Box", "Dozen", "Pair", "Set", "Nos"];
    const PAYMENT_METHODS: PurchaseInvoice["paymentMethod"][] = ["Cash", "Credit", "G Pay", "Net Banking"];
    const INVOICE_SIZES: PurchaseInvoice["invoiceSize"][] = ["A4", "A5"];
    const INVOICE_FORMATS: PurchaseInvoice["invoiceFormat"][] = ["Supermarket", "Hotel", "Stationery Shop"];

    // Form State
    const [formData, setFormData] = useState({
        itemName: "",
        sku: "",
        hsnCode: "",
        quantity: "",
        unit: "Pcs",
        price: "",
        category: "General",
        gstRate: "0",
        stateOfSupply: ""
    });

    // Full Purchase Invoice Template Config matching InvoiceTemplateEditor.tsx
    const DEFAULT_PURCHASE_CONFIG = {
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
            show: false,
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
            "notes",
            "terms",
            "signature",
            "footer"
        ]
    };

    const DEFAULT_PURCHASE_TEMPLATE_ITEM = {
        _id: "default-amber-purchase-template",
        name: "Amber Gold Purchase Bill (Default)",
        description: "Standard warm gold purchase invoice layout for retail & supermarket inventory.",
        status: "active",
        isDefault: true,
        config: DEFAULT_PURCHASE_CONFIG
    };

    const [userTemplates, setUserTemplates] = useState<any[]>([DEFAULT_PURCHASE_TEMPLATE_ITEM]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default-amber-purchase-template");

    const [isPurchaseTemplateModalOpen, setIsPurchaseTemplateModalOpen] = useState(false);
    const [isEditingPurchaseTemplate, setIsEditingPurchaseTemplate] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [purchaseTemplateName, setPurchaseTemplateName] = useState("");
    const [purchaseTemplateDesc, setPurchaseTemplateDesc] = useState("");
    const [purchaseTemplateStatus, setPurchaseTemplateStatus] = useState<"active" | "inactive">("active");
    const [purchaseConfig, setPurchaseConfig] = useState(DEFAULT_PURCHASE_CONFIG);
    const [editorTab, setEditorTab] = useState<"sections" | "ordering" | "styles">("sections");
    const [templateSearchTerm, setTemplateSearchTerm] = useState("");
    const [templateStatusFilter, setTemplateStatusFilter] = useState<"all" | "active" | "inactive">("all");
    const [isSavingPurchaseTemplate, setIsSavingPurchaseTemplate] = useState(false);

    const purchaseDragItem = useRef<number | null>(null);
    const purchaseDragOverItem = useRef<number | null>(null);

    const handlePurchaseSort = () => {
        if (purchaseDragItem.current === null || purchaseDragOverItem.current === null) return;
        const items = [...purchaseConfig.sectionsOrder];
        const draggedItemContent = items[purchaseDragItem.current];
        items.splice(purchaseDragItem.current, 1);
        items.splice(purchaseDragOverItem.current, 0, draggedItemContent);
        purchaseDragItem.current = null;
        purchaseDragOverItem.current = null;
        setPurchaseConfig(prev => ({ ...prev, sectionsOrder: items }));
    };

    const fetchUserTemplates = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const res = await fetch(`${API_BASE_URL}/purchase-templates`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                const list = (result.data && result.data.length > 0) ? result.data : [DEFAULT_PURCHASE_TEMPLATE_ITEM];
                setUserTemplates(list);
                const def = list.find((t: any) => t.isDefault);
                if (def) {
                    setSelectedTemplateId(def._id);
                } else if (list.length > 0) {
                    setSelectedTemplateId(list[0]._id);
                }
            } else {
                setUserTemplates([DEFAULT_PURCHASE_TEMPLATE_ITEM]);
                setSelectedTemplateId("default-amber-purchase-template");
            }
        } catch (err) {
            console.error("Error loading purchase templates:", err);
            setUserTemplates([DEFAULT_PURCHASE_TEMPLATE_ITEM]);
            setSelectedTemplateId("default-amber-purchase-template");
        }
    };

    const handleOpenNewPurchaseTemplate = () => {
        setEditingTemplateId(null);
        setPurchaseTemplateName("Amber Gold Purchase Layout");
        setPurchaseTemplateDesc("Professional warm gold purchase bill layout for supplier invoices and stock receipt.");
        setPurchaseTemplateStatus("active");
        setPurchaseConfig(DEFAULT_PURCHASE_CONFIG);
        setEditorTab("sections");
        setIsEditingPurchaseTemplate(true);
    };

    const handleEditPurchaseTemplate = (tpl: any) => {
        setEditingTemplateId(tpl._id);
        setPurchaseTemplateName(tpl.name || "");
        setPurchaseTemplateDesc(tpl.description || "");
        setPurchaseTemplateStatus(tpl.status || "active");
        const cfg = tpl.config || {};
        setPurchaseConfig({
            ...DEFAULT_PURCHASE_CONFIG,
            ...cfg,
            header: { ...DEFAULT_PURCHASE_CONFIG.header, ...cfg.header },
            supplier: { ...DEFAULT_PURCHASE_CONFIG.supplier, ...cfg.supplier },
            customer: { ...DEFAULT_PURCHASE_CONFIG.customer, ...cfg.customer },
            invoiceInfo: {
                ...DEFAULT_PURCHASE_CONFIG.invoiceInfo,
                ...cfg.invoiceInfo,
                labels: { ...DEFAULT_PURCHASE_CONFIG.invoiceInfo.labels, ...cfg.invoiceInfo?.labels }
            },
            items: {
                ...DEFAULT_PURCHASE_CONFIG.items,
                ...cfg.items,
                labels: { ...DEFAULT_PURCHASE_CONFIG.items.labels, ...cfg.items?.labels }
            },
            tax: { ...DEFAULT_PURCHASE_CONFIG.tax, ...cfg.tax },
            payment: { ...DEFAULT_PURCHASE_CONFIG.payment, ...cfg.payment },
            notes: { ...DEFAULT_PURCHASE_CONFIG.notes, ...cfg.notes },
            terms: { ...DEFAULT_PURCHASE_CONFIG.terms, ...cfg.terms },
            signature: { ...DEFAULT_PURCHASE_CONFIG.signature, ...cfg.signature },
            footer: { ...DEFAULT_PURCHASE_CONFIG.footer, ...cfg.footer },
            design: { ...DEFAULT_PURCHASE_CONFIG.design, ...cfg.design },
            sectionsOrder: cfg.sectionsOrder || DEFAULT_PURCHASE_CONFIG.sectionsOrder
        });
        setEditorTab("sections");
        setIsEditingPurchaseTemplate(true);
    };

    const handleDuplicatePurchaseTemplate = async (id: string) => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}/duplicate`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Purchase template duplicated successfully!");
                fetchUserTemplates();
            } else {
                const data = await res.json();
                toast.error(data.error?.message || "Failed to duplicate template");
            }
        } catch (err) {
            toast.error("Connection error duplicating template");
        }
    };

    const handleSetDefaultPurchaseTemplate = async (id: string) => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}/set-default`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Default purchase template updated!");
                fetchUserTemplates();
            } else {
                const data = await res.json();
                toast.error(data.error?.message || "Failed to set default template");
            }
        } catch (err) {
            toast.error("Error setting default template");
        }
    };

    const handleDeletePurchaseTemplate = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this purchase template?")) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Purchase template deleted!");
                fetchUserTemplates();
            } else {
                const data = await res.json();
                toast.error(data.error?.message || "Failed to delete purchase template");
            }
        } catch (err) {
            toast.error("Error deleting template");
        }
    };

    const handleSavePurchaseTemplate = async () => {
        if (!purchaseTemplateName.trim()) {
            toast.error("Please enter a purchase template name");
            return;
        }

        setIsSavingPurchaseTemplate(true);
        try {
            const token = localStorage.getItem("token");
            const payload = {
                name: purchaseTemplateName.trim(),
                description: purchaseTemplateDesc.trim(),
                status: purchaseTemplateStatus,
                config: purchaseConfig
            };

            const url = editingTemplateId
                ? `${API_BASE_URL}/purchase-templates/${editingTemplateId}`
                : `${API_BASE_URL}/purchase-templates`;
            const method = editingTemplateId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success(editingTemplateId ? "Purchase template updated!" : "Purchase template created!");
                fetchUserTemplates();
                setIsEditingPurchaseTemplate(false);
            } else {
                const data = await res.json();
                toast.error(data.error?.message || "Failed to save purchase template");
            }
        } catch (err) {
            toast.error("Error saving purchase template");
        } finally {
            setIsSavingPurchaseTemplate(false);
        }
    };

    const updatePurchaseSubConfig = (section: string, field: string, value: any) => {
        setPurchaseConfig(prev => ({
            ...prev,
            [section]: {
                ...(prev[section as keyof typeof prev] as object),
                [field]: value
            }
        }));
    };

    const updatePurchaseLabel = (section: 'invoiceInfo' | 'items', field: string, value: string) => {
        setPurchaseConfig(prev => {
            const sectionConfig = prev[section] as any;
            return {
                ...prev,
                [section]: {
                    ...sectionConfig,
                    labels: {
                        ...sectionConfig.labels,
                        [field]: value
                    }
                }
            };
        });
    };

    const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);

    const generatePurchaseNo = (invoicesList: PurchaseInvoice[] = purchaseInvoices) => {
        const prefix = 'PUR';
        let next = 1;
        if (invoicesList && invoicesList.length > 0) {
            const matchingNos = invoicesList
                .filter(inv => inv.billNo && inv.billNo.startsWith(`${prefix}-`))
                .map(inv => {
                    const parts = inv.billNo.split('-');
                    const numStr = parts[parts.length - 1];
                    const num = parseInt(numStr, 10);
                    return isNaN(num) ? 0 : num;
                });
            if (matchingNos.length > 0) {
                next = Math.max(...matchingNos) + 1;
            }
        }
        return `${prefix}-${String(next).padStart(5, '0')}`;
    };

    const fetchPurchaseInvoices = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/purchase-invoice/all`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const fetched = data.invoices || [];
                setPurchaseInvoices(fetched);
                setPurchaseInvoice(prev => {
                    if (!prev.billNo || prev.billNo.startsWith('INV-')) {
                        return { ...prev, billNo: generatePurchaseNo(fetched) };
                    }
                    return prev;
                });
                return fetched;
            }
        } catch (error) {
            console.error("Error fetching purchase invoices:", error);
        }
        return [];
    };

    const [purchaseInvoice, setPurchaseInvoice] = useState<PurchaseInvoice>({
        type: 'purchase',
        customerType: 'B2C',
        customerName: '',
        customerPhone: '',
        customerGstin: '',
        supplierName: '',
        phone: '',
        gstin: '',
        billNo: '',
        billDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        invoiceSize: 'A4',
        invoiceFormat: 'Supermarket',
        stateOfSupply: '',
        businessState: BUSINESS_STATE,
        items: [],
        subtotal: 0,
        totalSgst: 0,
        totalCgst: 0,
        totalIgst: 0,
        totalTax: 0,
        total: 0,
        paid: 0,
        balance: 0,
    });

    const [purchaseNewItem, setPurchaseNewItem] = useState<Partial<PurchaseItem>>({
        itemName: '',
        itemCode: '',
        codeType: 'HSN',
        hsnCode: '',
        quantity: 1,
        unit: 'Pcs',
        pricePerUnit: 0,
        priceWithTax: false,
        discountPercent: 0,
        taxPercent: 18,
    });

    const [isPurchaseSaving, setIsPurchaseSaving] = useState(false);
    const [lastSavedPurchaseId, setLastSavedPurchaseId] = useState<string | null>(null);
    const [purchaseSearchTerm, setPurchaseSearchTerm] = useState("");

    const deletePurchaseInvoice = async (invoiceId: string) => {
        if (!confirm("Are you sure you want to delete this purchase invoice?")) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/purchase-invoice/${invoiceId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Purchase invoice deleted successfully!");
                fetchPurchaseInvoices();
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to delete purchase invoice");
            }
        } catch (error) {
            console.error("Error deleting purchase invoice:", error);
            toast.error("Error deleting purchase invoice");
        }
    };

    const isInterStatePurchase = (): boolean => {
        const supplierState = purchaseInvoice.stateOfSupply;
        return supplierState !== '' && BUSINESS_STATE !== '' && supplierState !== BUSINESS_STATE;
    };

    const findInventoryMatch = (itemName = '', itemCode = '') => {
        const normalizedName = itemName.trim().toLowerCase();
        const normalizedCode = itemCode.trim().toLowerCase();

        return items.find(item => {
            const itemSku = item.sku?.trim().toLowerCase();
            const existingName = item.itemName?.trim().toLowerCase();
            return (normalizedCode && itemSku === normalizedCode) || (normalizedName && existingName === normalizedName);
        });
    };

    const applyHsnSacAutomation = (field: 'itemName' | 'itemCode', value: string) => {
        setPurchaseNewItem(prev => {
            const next = { ...prev, [field]: value };
            const matchedItem = findInventoryMatch(
                field === 'itemName' ? value : next.itemName,
                field === 'itemCode' ? value : next.itemCode
            );

            if (matchedItem?.hsnCode && !next.hsnCode) {
                next.hsnCode = matchedItem.hsnCode;
                next.codeType = 'HSN';
            }

            if (matchedItem?.gstRate !== undefined && matchedItem.gstRate !== null) {
                next.taxPercent = matchedItem.gstRate;
            }

            if (matchedItem?.unit) {
                next.unit = matchedItem.unit;
            }

            return next;
        });
    };

    const calculatePurchaseItemAmounts = (item: Partial<PurchaseItem>): Partial<PurchaseItem> => {
        const qty = item.quantity || 0;
        const price = item.pricePerUnit || 0;
        const discountPct = item.discountPercent || 0;
        const taxPct = item.taxPercent || 0;
        const priceWithTax = item.priceWithTax || false;

        const baseAmount = qty * price;
        const discountAmount = (baseAmount * discountPct) / 100;
        const afterDiscount = baseAmount - discountAmount;

        const isInterState = isInterStatePurchase();

        let sgstRate = 0, cgstRate = 0, igstRate = 0;
        let sgstAmount = 0, cgstAmount = 0, igstAmount = 0;
        let taxAmount = 0;
        let finalAmount = 0;

        if (isInterState) {
            igstRate = taxPct;
            if (priceWithTax) {
                const taxMultiplier = 1 + (igstRate / 100);
                const preTaxAmount = afterDiscount / taxMultiplier;
                igstAmount = afterDiscount - preTaxAmount;
                finalAmount = afterDiscount;
            } else {
                igstAmount = (afterDiscount * igstRate) / 100;
                finalAmount = afterDiscount + igstAmount;
            }
            taxAmount = igstAmount;
        } else {
            sgstRate = taxPct / 2;
            cgstRate = taxPct / 2;
            if (priceWithTax) {
                const taxMultiplier = 1 + (taxPct / 100);
                const preTaxAmount = afterDiscount / taxMultiplier;
                taxAmount = afterDiscount - preTaxAmount;
                sgstAmount = taxAmount / 2;
                cgstAmount = taxAmount / 2;
                finalAmount = afterDiscount;
            } else {
                sgstAmount = (afterDiscount * sgstRate) / 100;
                cgstAmount = (afterDiscount * cgstRate) / 100;
                taxAmount = sgstAmount + cgstAmount;
                finalAmount = afterDiscount + taxAmount;
            }
        }

        return {
            ...item,
            discountAmount: Math.round(discountAmount * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            sgstRate: Math.round(sgstRate * 100) / 100,
            sgstAmount: Math.round(sgstAmount * 100) / 100,
            cgstRate: Math.round(cgstRate * 100) / 100,
            cgstAmount: Math.round(cgstAmount * 100) / 100,
            igstRate: Math.round(igstRate * 100) / 100,
            igstAmount: Math.round(igstAmount * 100) / 100,
            isInterState,
            amount: Math.round(finalAmount * 100) / 100,
        };
    };

    const calculatePurchaseTotals = (items: PurchaseItem[]) => {
        const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.pricePerUnit) - i.discountAmount, 0);
        const totalSgst = items.reduce((sum, i) => sum + i.sgstAmount, 0);
        const totalCgst = items.reduce((sum, i) => sum + i.cgstAmount, 0);
        const totalIgst = items.reduce((sum, i) => sum + i.igstAmount, 0);
        const totalTax = totalSgst + totalCgst + totalIgst;
        const total = items.reduce((sum, i) => sum + i.amount, 0);
        return {
            subtotal: Math.round(subtotal * 100) / 100,
            totalSgst: Math.round(totalSgst * 100) / 100,
            totalCgst: Math.round(totalCgst * 100) / 100,
            totalIgst: Math.round(totalIgst * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            total: Math.round(total * 100) / 100,
        };
    };

    const addPurchaseItem = () => {
        if (!purchaseNewItem.itemName || !purchaseNewItem.pricePerUnit) {
            toast.error("Please enter item name and price");
            return;
        }
        if (!purchaseInvoice.stateOfSupply) {
            toast.error("Please select State of Supply for GST calculation");
            return;
        }

        const calculatedItem = calculatePurchaseItemAmounts(purchaseNewItem);
        const item: PurchaseItem = {
            id: `pur-item-${Date.now()}`,
            itemName: purchaseNewItem.itemName || '',
            itemCode: purchaseNewItem.itemCode || '',
            codeType: purchaseNewItem.codeType || 'HSN',
            hsnCode: purchaseNewItem.hsnCode || '',
            quantity: purchaseNewItem.quantity || 1,
            unit: purchaseNewItem.unit || 'Pcs',
            pricePerUnit: purchaseNewItem.pricePerUnit || 0,
            priceWithTax: purchaseNewItem.priceWithTax || false,
            discountPercent: purchaseNewItem.discountPercent || 0,
            discountAmount: calculatedItem.discountAmount || 0,
            taxPercent: purchaseNewItem.taxPercent || 0,
            taxAmount: calculatedItem.taxAmount || 0,
            sgstRate: calculatedItem.sgstRate || 0,
            sgstAmount: calculatedItem.sgstAmount || 0,
            cgstRate: calculatedItem.cgstRate || 0,
            cgstAmount: calculatedItem.cgstAmount || 0,
            igstRate: calculatedItem.igstRate || 0,
            igstAmount: calculatedItem.igstAmount || 0,
            isInterState: calculatedItem.isInterState || false,
            amount: calculatedItem.amount || 0,
        };

        const updatedItems = [...purchaseInvoice.items, item];
        const totals = calculatePurchaseTotals(updatedItems);

        setPurchaseInvoice(prev => ({
            ...prev,
            items: updatedItems,
            ...totals,
            balance: totals.total - prev.paid,
        }));

        setPurchaseNewItem({
            itemName: '',
            itemCode: '',
            codeType: 'HSN',
            hsnCode: '',
            quantity: 1,
            unit: 'Pcs',
            pricePerUnit: 0,
            priceWithTax: false,
            discountPercent: 0,
            taxPercent: 18,
        });

        toast.success("Item added to purchase invoice");
    };

    const removePurchaseItem = (itemId: string) => {
        const updatedItems = purchaseInvoice.items.filter(i => i.id !== itemId);
        const totals = calculatePurchaseTotals(updatedItems);
        setPurchaseInvoice(prev => ({
            ...prev,
            items: updatedItems,
            ...totals,
            balance: totals.total - prev.paid,
        }));
    };

    const savePurchaseInvoice = async () => {
        if (purchaseInvoice.items.length === 0) {
            toast.error("Please add at least one item");
            return;
        }
        if (!purchaseInvoice.supplierName.trim()) {
            toast.error("Please enter supplier name");
            return;
        }
        if (!purchaseInvoice.customerName.trim()) {
            toast.error("Please enter customer name for Bill To");
            return;
        }
        if (purchaseInvoice.customerType === 'B2B' && !purchaseInvoice.customerGstin.trim()) {
            toast.error("Please enter customer GSTIN for B2B invoice");
            return;
        }

        setIsPurchaseSaving(true);
        try {
            const token = localStorage.getItem("token");
            const activeTemplate = userTemplates.find((t: any) => t._id === selectedTemplateId);
            const payload = {
                ...purchaseInvoice,
                templateId: selectedTemplateId || undefined,
                templateSnapshot: activeTemplate ? activeTemplate.config : undefined,
            };

            const res = await fetch(`${API_BASE_URL}/purchase-invoice/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const stockUpdates = data.stockUpdates || [];
                const added = stockUpdates.filter((s: { action: string }) => s.action === 'created').length;
                const updated = stockUpdates.filter((s: { action: string }) => s.action === 'updated').length;

                let msg = "Purchase invoice saved!";
                if (added > 0) msg += ` ${added} new item(s) added to stock.`;
                if (updated > 0) msg += ` ${updated} item(s) stock updated.`;

                toast.success(msg);
                setLastSavedPurchaseId(data.invoice?._id || null);
                fetchItems(); // Refresh inventory items list
                fetchPurchaseInvoices(); // Refresh purchase invoices list to update sequence
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to save purchase invoice");
            }
        } catch (error) {
            console.error("Error saving purchase invoice:", error);
            toast.error("Error saving purchase invoice");
        } finally {
            setIsPurchaseSaving(false);
        }
    };

    const resetPurchaseForm = () => {
        setPurchaseInvoice({
            type: 'purchase',
            customerType: 'B2C',
            customerName: '',
            customerPhone: '',
            customerGstin: '',
            supplierName: '',
            phone: '',
            gstin: '',
            billNo: generatePurchaseNo(),
            billDate: new Date().toISOString().split('T')[0],
            paymentMethod: 'Cash',
            invoiceSize: 'A4',
            invoiceFormat: 'Supermarket',
            stateOfSupply: '',
            businessState: BUSINESS_STATE,
            items: [],
            subtotal: 0,
            totalSgst: 0,
            totalCgst: 0,
            totalIgst: 0,
            totalTax: 0,
            total: 0,
            paid: 0,
            balance: 0,
        });
        setLastSavedPurchaseId(null);
    };

    // Export purchase invoice as CSV
    const exportPurchaseCSV = () => {
        if (purchaseInvoice.items.length === 0) {
            toast.error("No items to export. Please add items first.");
            return;
        }

        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const items = purchaseInvoice.items;
        const anyTax = items.some(i => i.taxAmount > 0);
        const anyDiscount = items.some(i => i.discountAmount > 0);
        const anyCode = items.some(i => i.itemCode);
        const anyHSN = items.some(i => i.hsnCode);

        // Header — only non-empty fields
        let csvContent = "PURCHASE INVOICE DETAILS\n";
        if (purchaseInvoice.billNo) csvContent += `Bill No,${purchaseInvoice.billNo}\n`;
        if (purchaseInvoice.billDate) csvContent += `Bill Date,${purchaseInvoice.billDate}\n`;
        csvContent += `Invoice Size,${purchaseInvoice.invoiceSize}\n`;
        csvContent += `Invoice Format,${purchaseInvoice.invoiceFormat}\n`;
        csvContent += `Payment Method,${purchaseInvoice.paymentMethod}\n`;
        csvContent += `Customer Type,${purchaseInvoice.customerType}\n`;
        if (purchaseInvoice.customerName) csvContent += `Customer Name,${esc(purchaseInvoice.customerName)}\n`;
        if (purchaseInvoice.customerPhone) csvContent += `Customer Phone,${purchaseInvoice.customerPhone}\n`;
        if (purchaseInvoice.customerType === 'B2B' && purchaseInvoice.customerGstin) csvContent += `Customer GSTIN,${purchaseInvoice.customerGstin}\n`;
        if (purchaseInvoice.supplierName) csvContent += `Supplier Name,${esc(purchaseInvoice.supplierName)}\n`;
        if (purchaseInvoice.phone) csvContent += `Phone,${purchaseInvoice.phone}\n`;
        if (purchaseInvoice.gstin) csvContent += `Supplier GSTIN,${purchaseInvoice.gstin}\n`;
        if (purchaseInvoice.stateOfSupply) csvContent += `State of Supply,${purchaseInvoice.stateOfSupply}\n`;
        if (purchaseInvoice.businessState) csvContent += `Business State,${purchaseInvoice.businessState}\n`;
        csvContent += "\n";

        // Items — dynamic columns, no 6 GST columns
        csvContent += "ITEMS\n";
        const cols: string[] = ['Item Name'];
        if (anyCode) cols.push('Item Code');
        if (anyHSN) cols.push('Code Type', 'HSN/SAC Code');
        cols.push('Quantity', 'Unit', 'Price');
        if (anyDiscount) cols.push('Discount');
        if (anyTax) cols.push('Tax %', 'Tax Amt');
        cols.push('Line Total');
        csvContent += cols.join(',') + '\n';

        items.forEach(item => {
            const row: string[] = [esc(item.itemName)];
            if (anyCode) row.push(esc(item.itemCode || ''));
            if (anyHSN) row.push(item.codeType || 'HSN', esc(item.hsnCode || ''));
            row.push(String(item.quantity), esc(item.unit), String(item.pricePerUnit));
            if (anyDiscount) row.push(String(item.discountAmount));
            if (anyTax) {
                const taxPct = item.isInterState ? `IGST ${item.igstRate}%` : `${item.sgstRate + item.cgstRate}%`;
                row.push(item.taxAmount > 0 ? taxPct : '0%');
                row.push(String(item.taxAmount));
            }
            row.push(String(item.amount));
            csvContent += row.join(',') + '\n';
        });

        // Summary — recalculate from items, only non-zero values
        csvContent += "\nSUMMARY\n";
        const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.pricePerUnit) - i.discountAmount, 0);
        const totalTax = items.reduce((sum, i) => sum + i.taxAmount, 0);
        const grandTotal = items.reduce((sum, i) => sum + i.amount, 0);

        if (subtotal > 0) csvContent += `Subtotal,${Math.round(subtotal * 100) / 100}\n`;
        if (anyDiscount) {
            const discTotal = items.reduce((sum, i) => sum + i.discountAmount, 0);
            if (discTotal > 0) csvContent += `Total Discount,${Math.round(discTotal * 100) / 100}\n`;
        }
        if (totalTax > 0) csvContent += `Total Tax,${Math.round(totalTax * 100) / 100}\n`;
        csvContent += `Grand Total,${Math.round(grandTotal * 100) / 100}\n`;
        if (purchaseInvoice.paid > 0) csvContent += `Amount Paid,${purchaseInvoice.paid}\n`;
        const balance = grandTotal - purchaseInvoice.paid;
        if (balance > 0) csvContent += `Balance Due,${Math.round(balance * 100) / 100}\n`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase_invoice_${purchaseInvoice.billNo}_${purchaseInvoice.billDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success("Purchase invoice exported to CSV!");
    };

    // Export all purchase history invoices to CSV
    const exportPurchaseHistoryToCSV = () => {
        if (!purchaseInvoices || purchaseInvoices.length === 0) {
            toast.error("No purchase bills found in history to export.");
            return;
        }

        const esc = (s: any) => `"${String(s || '').replace(/"/g, '""')}"`;

        const headers = [
            "Bill No",
            "Bill Date",
            "Supplier Name",
            "Phone No",
            "Supplier GSTIN",
            "Customer Type",
            "Payment Method",
            "Items Count",
            "Items Breakdown",
            "Grand Total (INR)",
            "Amount Paid (INR)",
            "Balance Due (INR)"
        ];

        let csvContent = headers.join(",") + "\n";

        purchaseInvoices.forEach(inv => {
            const itemsSummary = (inv.items || [])
                .map((item: any) => `${item.itemName || 'Item'} (${item.quantity || 1} ${item.unit || 'Pcs'} @ ₹${item.pricePerUnit || 0})`)
                .join("; ");

            const grandTotal = inv.total || 0;
            const paid = inv.paid || 0;
            const balance = inv.balance ?? (grandTotal - paid);

            const row = [
                esc(inv.billNo),
                esc(inv.billDate),
                esc(inv.supplierName || inv.partyName),
                esc(inv.phone || inv.phoneNo),
                esc(inv.gstin || inv.sellerGSTIN || ''),
                esc(inv.customerType || 'B2C'),
                esc(inv.paymentMethod || inv.saleType || 'CASH'),
                inv.items?.length || 0,
                esc(itemsSummary),
                grandTotal.toFixed(2),
                paid.toFixed(2),
                balance.toFixed(2)
            ];

            csvContent += row.join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase_history_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Exported ${purchaseInvoices.length} purchase bill(s) to CSV!`);
    };

    // Export all inventory items to CSV
    const exportInventoryItemsToCSV = () => {
        if (!filteredItems || filteredItems.length === 0) {
            toast.error("No inventory items to export.");
            return;
        }
        const esc = (s: any) => `"${String(s || '').replace(/"/g, '""')}"`;
        const headers = ["Item Name", "Category", "Quantity", "Price (INR)", "Status", "Low Stock Alert"];
        let csvContent = headers.join(",") + "\n";
        filteredItems.forEach(item => {
            const row = [
                esc(item.name),
                esc(item.category || 'General'),
                item.quantity,
                item.price,
                esc(item.quantity <= 0 ? 'Out of Stock' : item.quantity <= (item.lowStockThreshold || 5) ? 'Low Stock' : 'In Stock'),
                item.quantity <= (item.lowStockThreshold || 5) ? 'Yes' : 'No'
            ];
            csvContent += row.join(",") + "\n";
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_items_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Exported ${filteredItems.length} inventory item(s) to CSV!`);
    };

    // Export all sales history records to CSV
    const exportSalesHistoryToCSV = () => {
        if (!sales || sales.length === 0) {
            toast.error("No sales history to export.");
            return;
        }
        const esc = (s: any) => `"${String(s || '').replace(/"/g, '""')}"`;
        const headers = ["Date", "Item Name", "Quantity Sold", "Total Amount (INR)", "Payment Method"];
        let csvContent = headers.join(",") + "\n";
        sales.forEach(sale => {
            const row = [
                esc(sale.date ? new Date(sale.date).toLocaleDateString() : ''),
                esc(sale.itemName || sale.productName || 'Item'),
                sale.quantity || 1,
                (sale.totalAmount || sale.amount || 0).toFixed(2),
                esc(sale.paymentMethod || 'Cash')
            ];
            csvContent += row.join(",") + "\n";
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales_history_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Exported ${sales.length} sales history record(s) to CSV!`);
    };

    // Print purchase invoice - open public view in new tab
    const printPurchaseInvoice = () => {
        if (!lastSavedPurchaseId) {
            toast.error("Please save the invoice first before printing.");
            return;
        }
        const url = `${window.location.origin}/purchase-invoice/view/${lastSavedPurchaseId}`;
        window.open(url, '_blank');
    };

    // Copy purchase invoice details to clipboard
    const copyPurchaseDetails = () => {
        const itemsList = purchaseInvoice.items.map(item =>
            `- ${item.itemName}: ${item.quantity} ${item.unit} x ${item.pricePerUnit} = ${item.amount}`
        ).join('\n');

        const details = `Purchase Invoice: ${purchaseInvoice.billNo}
Date: ${purchaseInvoice.billDate}
Format: ${purchaseInvoice.invoiceSize} - ${purchaseInvoice.invoiceFormat}
Payment Method: ${purchaseInvoice.paymentMethod}
Bill To: ${purchaseInvoice.customerName}
Customer Type: ${purchaseInvoice.customerType}
Customer Phone: ${purchaseInvoice.customerPhone || '-'}
${purchaseInvoice.customerType === 'B2B' ? `Customer GSTIN: ${purchaseInvoice.customerGstin || '-'}\n` : ''}Supplier: ${purchaseInvoice.supplierName}
Phone: ${purchaseInvoice.phone}
GSTIN: ${purchaseInvoice.gstin}

Items:
${itemsList}

Total: ${purchaseInvoice.total.toFixed(2)}
Paid: ${purchaseInvoice.paid.toFixed(2)}
Balance: ${purchaseInvoice.balance.toFixed(2)}`;

        navigator.clipboard.writeText(details)
            .then(() => toast.success("Purchase invoice details copied to clipboard!"))
            .catch(() => toast.error("Failed to copy to clipboard"));
    };

    // Share purchase invoice on WhatsApp
    const sharePurchaseOnWhatsApp = () => {
        if (purchaseInvoice.items.length === 0) {
            toast.error("Add items before sharing");
            return;
        }

        if (!lastSavedPurchaseId) {
            toast.error("Please save the invoice first before sharing.");
            return;
        }

        const customerName = purchaseInvoice.customerName || 'Valued Customer';
        const sellerName = purchaseInvoice.supplierName || 'SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED';
        const shareLink = `${window.location.origin}/purchase-invoice/view/${lastSavedPurchaseId}`;

        let message = `*PURCHASE INVOICE: ${purchaseInvoice.billNo}*\n`;
        message += `__________________________\n\n`;
        message += `Dear *${customerName}*,\n\n`;
        message += `A new invoice has been generated for your recent transaction with *${sellerName}*.\n\n`;
        message += `*Bill Summary:*\n`;
        message += `• Invoice ID: #${purchaseInvoice.billNo}\n`;
        message += `• Date: ${purchaseInvoice.billDate}\n`;
        message += `• Total Amount: ₹${purchaseInvoice.total.toFixed(2)}\n\n`;
        message += `You can view, download, or pay your invoice online using the secure link below:\n`;
        message += `🔗 ${shareLink}\n\n`;
        message += `If you have any questions regarding this invoice, please feel free to reach out to us.\n\n`;
        message += `Best regards,\n`;
        message += `*${sellerName}*\n`;
        message += `__________________________\n`;
        message += `_Powered by Sri Andal Financial Automation_`;

        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    };

    // Share specific history purchase invoice on WhatsApp
    const shareHistoryPurchaseOnWhatsApp = (inv: any) => {
        if (!inv || !inv._id) {
            toast.error("Invalid invoice details");
            return;
        }

        const customerName = inv.customerName || 'Valued Customer';
        const sellerName = inv.supplierName || 'SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED';
        const billNo = inv.billNo || 'N/A';
        const billDate = inv.billDate || (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));
        const totalAmount = (inv.total || 0).toFixed(2);
        const shareLink = `${window.location.origin}/purchase-invoice/view/${inv._id}`;

        let message = `*PURCHASE INVOICE: ${billNo}*\n`;
        message += `__________________________\n\n`;
        message += `Dear *${customerName}*,\n\n`;
        message += `A new invoice has been generated for your recent transaction with *${sellerName}*.\n\n`;
        message += `*Bill Summary:*\n`;
        message += `• Invoice ID: #${billNo}\n`;
        message += `• Date: ${billDate}\n`;
        message += `• Total Amount: ₹${totalAmount}\n\n`;
        message += `You can view, download, or pay your invoice online using the secure link below:\n`;
        message += `🔗 ${shareLink}\n\n`;
        message += `If you have any questions regarding this invoice, please feel free to reach out to us.\n\n`;
        message += `Best regards,\n`;
        message += `*${sellerName}*\n`;
        message += `__________________________\n`;
        message += `_Powered by Sri Andal Financial Automation_`;

        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    };

    // Direct PDF download for Purchase Invoice matching official print view design
    const downloadPurchaseInvoicePDF = (inv: any) => {
        try {
            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

            const sellerName = inv.supplierName || 'SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED';
            const customerName = inv.customerName || 'Valued Customer';
            const billNo = inv.billNo || 'N/A';
            const billDate = inv.billDate || (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));
            const stateOfSupply = inv.stateOfSupply || 'Tamil Nadu';
            const paymentMethod = inv.paymentMethod || 'Cash';
            const customerType = inv.customerType || 'B2C';

            // Top Header Banner (Amber Theme Header - matching print view)
            doc.setFillColor(217, 119, 6);
            doc.rect(10, 10, 190, 32, "F");

            // Subtitle
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("TAX INVOICE / PURCHASE BILL", 16, 17);

            // Supplier Name Header Title
            doc.setFontSize(15);
            doc.setFont("helvetica", "bold");
            doc.text(sellerName.toUpperCase(), 16, 25);

            // Contact Info Subtitle
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            const sellerDetails = [
                inv.phone ? `Ph: ${inv.phone}` : '',
                inv.gstin ? `GSTIN: ${inv.gstin}` : '',
                `State: ${stateOfSupply}`
            ].filter(Boolean).join("  |  ");
            doc.text(sellerDetails, 16, 32);

            // Right side of Header Banner
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text("Bill No.", 194, 17, { align: "right" });

            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text(`#${billNo}`, 194, 24, { align: "right" });

            // Badge Box Right
            doc.setFillColor(255, 255, 255);
            doc.rect(160, 27, 34, 6, "F");
            doc.setTextColor(217, 119, 6);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text(`${customerType} | A4`, 177, 31.2, { align: "center" });

            // Party Details Section (Two Columns)
            // Left Column: Supplier & Customer
            let yLeft = 48;

            // Supplier Accent Line & Title
            doc.setFillColor(217, 119, 6);
            doc.rect(12, yLeft, 1.5, 4, "F");

            doc.setTextColor(217, 119, 6);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("SUPPLIER (VENDOR)", 16, yLeft + 3);

            yLeft += 7;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(sellerName, 16, yLeft);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            yLeft += 4.5;
            if (inv.phone) { doc.text(`Ph: ${inv.phone}`, 16, yLeft); yLeft += 4.5; }
            if (inv.gstin) { doc.text(`GSTIN: ${inv.gstin}`, 16, yLeft); yLeft += 4.5; }
            doc.text(`State of Supply: ${stateOfSupply}`, 16, yLeft);
            yLeft += 8;

            // Customer Accent Line & Title
            doc.setFillColor(217, 119, 6);
            doc.rect(12, yLeft, 1.5, 4, "F");

            doc.setTextColor(217, 119, 6);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("BILL TO (CUSTOMER)", 16, yLeft + 3);

            yLeft += 7;
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(customerName, 16, yLeft);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            yLeft += 4.5;
            doc.text(`Type: ${customerType}`, 16, yLeft);
            yLeft += 4.5;
            if (inv.customerPhone) { doc.text(`Phone: ${inv.customerPhone}`, 16, yLeft); yLeft += 4.5; }
            if (inv.customerGstin) { doc.text(`GSTIN: ${inv.customerGstin}`, 16, yLeft); yLeft += 4.5; }

            // Right Column: Info Cards
            const cardX = 145;
            const cardW = 55;

            // Bill Date Card
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.rect(cardX, 48, cardW, 12, "FD");
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(100, 116, 139);
            doc.text("BILL DATE", cardX + 3, 52.5);
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.text(billDate, cardX + 3, 57.5);

            // Payment Method Card
            doc.setFillColor(248, 250, 252);
            doc.rect(cardX, 63, cardW, 12, "FD");
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(100, 116, 139);
            doc.text("PAYMENT METHOD", cardX + 3, 67.5);
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.text(paymentMethod, cardX + 3, 72.5);

            // State Card
            doc.setFillColor(248, 250, 252);
            doc.rect(cardX, 78, cardW, 12, "FD");
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(100, 116, 139);
            doc.text("STATE OF SUPPLY", cardX + 3, 82.5);
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.text(stateOfSupply, cardX + 3, 87.5);

            const startTableY = Math.max(yLeft, 95) + 6;

            // Items Table (Amber Table Header matching Print View)
            const tableBody = (inv.items || []).map((item: any, idx: number) => {
                const qty = item.quantity || 1;
                const price = item.pricePerUnit || item.price || 0;
                const taxRate = item.taxPercent || item.gstRate || 0;
                const total = item.amount || item.subtotal || (qty * price * (1 + taxRate / 100));

                return [
                    idx + 1,
                    item.itemName || 'Item',
                    item.hsnCode || item.itemCode || '-',
                    qty,
                    item.unit || 'Pcs',
                    `Rs. ${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    `${taxRate}%`,
                    `Rs. ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ];
            });

            autoTable(doc, {
                startY: startTableY,
                margin: { left: 10, right: 10 },
                head: [["#", "Item Description", "HSN/SAC", "Qty", "Unit", "Price", "Tax", "Total"]],
                body: tableBody,
                headStyles: {
                    fillColor: [217, 119, 6],
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 9,
                    cellPadding: 3.5
                },
                bodyStyles: {
                    textColor: [15, 23, 42],
                    lineWidth: 0.1,
                    lineColor: [226, 232, 240],
                    fontSize: 8.5,
                    cellPadding: 3
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: "center" },
                    1: { cellWidth: 55 },
                    2: { cellWidth: 25 },
                    3: { cellWidth: 15, halign: "center" },
                    4: { cellWidth: 15, halign: "center" },
                    5: { cellWidth: 25, halign: "right" },
                    6: { cellWidth: 15, halign: "center" },
                    7: { cellWidth: 30, halign: "right" }
                },
                theme: "grid"
            });

            const finalY = (doc as any).lastAutoTable?.finalY || 140;

            // Summary Card Box (Bottom Right)
            const summaryX = 120;
            const summaryY = finalY + 8;
            const summaryWidth = 80;

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.rect(summaryX, summaryY, summaryWidth, 36, "FD");

            const subtotal = inv.subtotal || inv.total || 0;
            const taxAmount = inv.totalTax || inv.gstAmount || 0;
            const grandTotal = inv.total || 0;

            doc.setFontSize(8.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text("Subtotal:", summaryX + 4, summaryY + 8);
            doc.text(`Rs. ${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryX + summaryWidth - 4, summaryY + 8, { align: "right" });

            doc.text("Tax Amount:", summaryX + 4, summaryY + 16);
            doc.text(`Rs. ${taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryX + summaryWidth - 4, summaryY + 16, { align: "right" });

            doc.setDrawColor(226, 232, 240);
            doc.line(summaryX + 4, summaryY + 20, summaryX + summaryWidth - 4, summaryY + 20);

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text("Grand Total:", summaryX + 4, summaryY + 29);
            doc.setTextColor(217, 119, 6);
            doc.text(`Rs. ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, summaryX + summaryWidth - 4, summaryY + 29, { align: "right" });

            // Footer
            const footerY = 280;
            doc.setDrawColor(226, 232, 240);
            doc.line(10, footerY - 5, 200, footerY - 5);

            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("This is a computer generated invoice and does not require a physical signature.", 10, footerY);
            doc.text("Powered by Sri Andal AI Financial Automation", 200, footerY, { align: "right" });

            doc.save(`Purchase_Invoice_${billNo}.pdf`);
            toast.success(`Purchase Invoice #${billNo} PDF downloaded successfully!`);
        } catch (error) {
            console.error("PDF generation failed:", error);
            toast.error("Opening invoice print view...");
            window.open(`/purchase-invoice/view/${inv._id}`, '_blank');
        }
    };

    // Save and create new purchase invoice
    const saveAndNewPurchase = async () => {
        await savePurchaseInvoice();
        resetPurchaseForm();
    };

    // Voice State
    const [transcript, setTranscript] = useState("");
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);

    useEffect(() => {
        if (isPurchaseTemplateModalOpen) {
            fetchUserTemplates();
        }
    }, [isPurchaseTemplateModalOpen]);

    // Fetch Items
    useEffect(() => {
        fetchCustomCategories();
        fetchUserTemplates();
        if (activeTab === "items") {
            if (activeSubTab === "instock") {
                fetchItems();
            } else {
                fetchSales();
            }
        } else if (activeTab === "purchase") {
            fetchPurchaseInvoices();
        }
    }, [activeTab, activeSubTab]);

    const fetchCustomCategories = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/categories`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCustomCategories(data.categories || []);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        setIsSavingCategory(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/categories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ name: newCategoryName.trim() })
            });
            if (res.ok) {
                const data = await res.json();
                setCustomCategories(prev => [...prev, data.category]);
                setFormData(prev => ({ ...prev, category: data.category.name }));
                setNewCategoryName("");
                setIsAddingCategory(false);
                toast.success("Category added successfully");
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to add category");
            }
        } catch (error) {
            toast.error("Error adding category");
        } finally {
            setIsSavingCategory(false);
        }
    };

    const handleDeleteCategory = (id: string) => {
        setCategoryToDelete(id);
        setIsCategoryDeleteDialogOpen(true);
    };

    const confirmDeleteCategory = async () => {
        if (!categoryToDelete) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/categories/${categoryToDelete}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                setCustomCategories(prev => prev.filter(cat => cat._id !== categoryToDelete));
                toast.success("Category deleted");
            } else {
                toast.error("Failed to delete category");
            }
        } catch (error) {
            toast.error("Error deleting category");
        } finally {
            setIsCategoryDeleteDialogOpen(false);
            setCategoryToDelete(null);
        }
    };

    const checkLowStock = (itemsToCheck: InventoryItem[]) => {
        itemsToCheck.forEach(item => {
            if (item.quantity > 0 && item.quantity < 10) {
                toast("Low Stock Alert", {
                    description: `${item.itemName} (SKU: ${item.sku}) has only ${item.quantity} units left.`,
                    icon: "⚠️",
                    duration: 5000,
                });
            }
        });
    };

    const fetchItems = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/all`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data);
                // Check for low stock on load
                checkLowStock(data);
            }
        } catch (error) {
            console.error("Error fetching inventory:", error);
            toast.error("Failed to load inventory");
        } finally {
            setLoading(false);
        }
    };

    const fetchSales = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/sales`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSales(data.sales || []);
            }
        } catch (error) {
            console.error("Error fetching sales:", error);
            toast.error("Error fetching sales history");
        } finally {
            setLoading(false);
        }
    };

    const handleVoiceApply = async () => {
        if (!transcript.trim()) {
            toast.error("Please provide voice transcript");
            return;
        }

        const parsedSales = parseVoiceInventoryText(transcript);
        if (parsedSales.length === 0) {
            toast.error("Could not find any sale commands. Try: 'Sell 5 units of [item name]'");
            return;
        }

        setIsProcessingVoice(true);
        let successCount = 0;
        let failCount = 0;

        for (const sale of parsedSales) {
            // Find item by name or SKU
            const item = items.find(i =>
                i.itemName.toLowerCase().includes(sale.itemNameOrSku.toLowerCase()) ||
                i.sku.toLowerCase() === sale.itemNameOrSku.toLowerCase()
            );

            if (!item) {
                toast.error(`Item "${sale.itemNameOrSku}" not found`);
                failCount++;
                continue;
            }

            if (item.quantity < sale.quantitySold) {
                toast.error(`Insufficient stock for "${item.itemName}"`);
                failCount++;
                continue;
            }

            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_BASE_URL}/inventory/sell/${item._id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        quantitySold: sale.quantitySold
                    })
                });

                if (res.ok) {
                    successCount++;
                } else {
                    const data = await res.json();
                    toast.error(`Error selling ${item.itemName}: ${data.message}`);
                    failCount++;
                }
            } catch (error) {
                toast.error(`Error connecting for ${item.itemName}`);
                failCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully processed ${successCount} sales!`);
            fetchItems();
            setTranscript("");
            setActiveTab("items");
            setActiveSubTab("sold");
        }

        if (failCount > 0) {
            toast.error(`Failed to process ${failCount} items.`);
        }

        setIsProcessingVoice(false);
    };

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addItem = async () => {
        if (!formData.itemName || !formData.sku || !formData.quantity || !formData.price) {
            toast.error("Please fill in all required fields");
            return;
        }

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...formData,
                    quantity: Number(formData.quantity),
                    price: Number(formData.price)
                })
            });

            if (res.ok) {
                toast.success("Item added successfully!");
                setFormData({
                    itemName: "",
                    sku: "",
                    hsnCode: "",
                    quantity: "",
                    unit: "Pcs",
                    price: "",
                    category: "General",
                    gstRate: "0",
                    stateOfSupply: ""
                });
                fetchItems();
                setActiveTab("items");
            } else {
                toast.error("Failed to add item");
            }
        } catch (error) {
            console.error("Error adding item:", error);
            toast.error("Error adding item");
        }
    };

    const deleteItem = (id: string) => {
        setItemToDelete(id);
        setIsItemDeleteDialogOpen(true);
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete) return;

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/${itemToDelete}`, {
                method: 'DELETE',
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (res.ok) {
                setItems(prev => prev.filter(item => item._id !== itemToDelete));
                toast.success("Item deleted");
            } else {
                toast.error("Failed to delete item");
            }
        } catch (error) {
            console.error("Error deleting item:", error);
            toast.error("Error deleting item");
        } finally {
            setIsItemDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };

    const handleSellClick = (item: InventoryItem) => {
        setSelectedItem(item);
        setSellQuantity("1");
        setSellStateOfSupply(item.stateOfSupply || "");
        setIsSellDialogOpen(true);
    };

    const submitSell = async () => {
        if (!selectedItem || !sellQuantity) return;

        const qty = parseInt(sellQuantity);

        if (qty <= 0) {
            toast.error("Quantity must be greater than 0");
            return;
        }
        if (qty > selectedItem.quantity) {
            toast.error("Insufficient stock");
            return;
        }

        setIsSelling(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_BASE_URL}/inventory/sell/${selectedItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    quantitySold: qty,
                    stateOfSupply: sellStateOfSupply
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Sold ${qty} units of ${selectedItem.itemName}`);
                setIsSellDialogOpen(false);

                // Check if remaining stock is low
                const remainingQty = selectedItem.quantity - qty;
                if (remainingQty > 0 && remainingQty < 10) {
                    toast("Low Stock Warning", {
                        description: `${selectedItem.itemName} is now at ${remainingQty} units.`,
                        icon: "🚨",
                        duration: 6000
                    });
                }

                fetchItems(); // Refresh items
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to sell item");
            }
        } catch (error) {
            console.error("Error selling item:", error);
            toast.error("Error selling item");
        } finally {
            setIsSelling(false);
        }
    };

    const filteredItems = items.filter(item =>
        (item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchTerm.toLowerCase())) &&
        item.quantity > 0
    );

    const filteredSales = sales.filter(sale =>
        sale.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleBackToDashboard = () => {
        navigate("/dashboard");
    };

    return (
        <div className="liquid-page module-ink min-h-screen overflow-hidden text-slate-950">
            <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl">
                <div className="mx-auto max-w-7xl px-6 py-6">
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={handleBackToDashboard}
                            className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Dashboard
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => navigate("/inventory/purchase-templates")}
                            className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950 flex items-center gap-1.5 font-semibold"
                        >
                            <Layout className="h-4 w-4 text-amber-600" />
                            Purchase Invoice Templates
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
                            <Package className="h-8 w-8 text-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                                Inventory Management
                            </h1>
                            <p className="mt-1 text-slate-600">Track stock, manage items, and monitor assets</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 mx-auto max-w-7xl px-6 py-12">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="grid w-full grid-cols-4 rounded-[24px] border border-white/55 bg-white/42 p-1 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                        <TabsTrigger value="items" className="rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                            <Archive className="h-4 w-4 mr-2" /> Items
                        </TabsTrigger>
                        <TabsTrigger value="add" className="rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                            <Plus className="h-4 w-4 mr-2" /> Add Item
                        </TabsTrigger>
                        <TabsTrigger value="purchase" className="rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                            <ShoppingCart className="h-4 w-4 mr-2" /> Purchase
                        </TabsTrigger>
                        <TabsTrigger value="voice" className="rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                            <Mic className="h-4 w-4 mr-2" /> Voice
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="items">
                        <div className="flex space-x-2 mb-6 bg-white/5 p-1 rounded-xl w-fit">
                            <button
                                onClick={() => setActiveSubTab("instock")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSubTab === "instock" ? "bg-violet-600 text-white shadow-lg" : "text-violet-300 hover:bg-white/5"
                                    }`}
                            >
                                <Package className="h-4 w-4 inline-block mr-2" />
                                In Stock
                            </button>
                            <button
                                onClick={() => setActiveSubTab("sold")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSubTab === "sold" ? "bg-violet-600 text-white shadow-lg" : "text-violet-300 hover:bg-white/5"
                                    }`}
                            >
                                <ShoppingCart className="h-4 w-4 inline-block mr-2" />
                                Sales History
                            </button>
                        </div>

                        <Card className="backdrop-blur-2xl bg-white/10 border border-violet-400/20 rounded-3xl">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle className="text-2xl font-bold text-violet-100">
                                            {activeSubTab === "instock" ? "Inventory Items" : "Sales History"}
                                        </CardTitle>
                                        <CardDescription className="text-violet-300/70">
                                            {activeSubTab === "instock"
                                                ? `${items.length} items in stock`
                                                : `${sales.length} sales transactions record`}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-300" />
                                            <Input
                                                placeholder="Search..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10 bg-white/5 border-violet-400/30 text-violet-100 placeholder:text-violet-300/40 w-64"
                                            />
                                        </div>
                                        <VoiceButton
                                            onTranscript={(text) => setSearchTerm(text)}
                                            onClear={() => setSearchTerm("")}
                                        />
                                        <Button
                                            onClick={activeSubTab === "instock" ? exportInventoryItemsToCSV : exportSalesHistoryToCSV}
                                            className="h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center gap-2 shadow-sm transition-all"
                                        >
                                            <Download className="h-4 w-4" />
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {loading ? (
                                        <p className="text-center text-violet-300 py-12">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                                            Loading data...
                                        </p>
                                    ) : activeSubTab === "instock" ? (
                                        // IN STOCK LIST
                                        filteredItems.length > 0 ? (
                                            filteredItems.map((item) => (
                                                <div key={item._id} className="p-4 backdrop-blur-xl bg-white/5 border border-violet-400/10 rounded-2xl hover:bg-white/10 transition-all flex justify-between items-center group">
                                                    <div>
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-lg font-semibold text-violet-100">{item.itemName}</h3>
                                                            <Badge variant="outline" className="border-violet-400/30 text-violet-300">{item.category}</Badge>
                                                        </div>
                                                        <p className="text-violet-300/60 text-sm">SKU: {item.sku}{item.hsnCode ? ` | HSN: ${item.hsnCode}` : ''}</p>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <p className="text-violet-100 font-bold text-lg">₹{item.price}</p>
                                                            <p className="text-violet-300/60 text-sm">Qty: {item.quantity} {item.unit || 'Pcs'}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {/* <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleSellClick(item)}
                                                                className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                                                            >
                                                                <ShoppingCart className="h-4 w-4 mr-2" /> Sell
                                                            </Button> */}
                                                            <Button variant="ghost" size="sm" onClick={() => deleteItem(item._id!)} className="text-red-300 hover:text-red-100 hover:bg-red-500/20">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-violet-300/60">No items found matching your search.</div>
                                        )
                                    ) : (
                                        // SALES HISTORY LIST
                                        filteredSales.length > 0 ? (
                                            filteredSales.map((sale) => (
                                                <div key={sale._id} className="p-4 backdrop-blur-xl bg-white/5 border border-violet-400/10 rounded-2xl hover:bg-white/10 transition-all grid grid-cols-12 gap-4 items-center">
                                                    <div className="col-span-4">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-lg font-semibold text-violet-100">{sale.itemName}</h3>
                                                            <Badge className="bg-emerald-500/20 text-emerald-300 border-none">Sold</Badge>
                                                        </div>
                                                        <p className="text-violet-300/60 text-sm">SKU: {sale.sku} • {new Date(sale.saleDate).toLocaleDateString()}</p>
                                                        {sale.stateOfSupply && (
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <Shield className="h-3 w-3 text-violet-400/50" />
                                                                <span className="text-[10px] uppercase tracking-wider text-violet-400/50 font-bold">Supply: {sale.stateOfSupply}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 text-right border-r border-violet-400/10 pr-4">
                                                        <p className="text-violet-300/60 text-xs uppercase">Quantity</p>
                                                        <p className="text-violet-100 font-medium">{sale.quantitySold} x ₹{sale.unitPrice}</p>
                                                    </div>
                                                    <div className="col-span-2 text-right border-r border-violet-400/10 pr-4">
                                                        <p className="text-violet-300/60 text-xs uppercase">Subtotal</p>
                                                        <p className="text-violet-100 font-medium">₹{sale.subtotal.toFixed(2)}</p>
                                                    </div>
                                                    <div className="col-span-2 text-right border-r border-violet-400/10 pr-4">
                                                        <p className="text-violet-300/60 text-xs uppercase">Tax Breakdown</p>
                                                        <div className="text-violet-100 text-xs space-y-0.5">
                                                            {sale.sgstRate > 0 && <p>SGST ({sale.sgstRate}%): ₹{sale.sgstAmount.toFixed(2)}</p>}
                                                            {sale.cgstRate > 0 && <p>CGST ({sale.cgstRate}%): ₹{sale.cgstAmount.toFixed(2)}</p>}
                                                            {sale.igstRate > 0 && <p>IGST ({sale.igstRate}%): ₹{sale.igstAmount.toFixed(2)}</p>}
                                                            {sale.gstRate > 0 && !(sale.sgstRate || sale.cgstRate || sale.igstRate) && (
                                                                <p>GST ({sale.gstRate}%): ₹{sale.gstAmount.toFixed(2)}</p>
                                                            )}
                                                            {sale.gstRate === 0 && <p className="text-violet-400/40 italic">No Tax</p>}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 text-right">
                                                        <p className="text-violet-300/60 text-xs uppercase">Grand Total</p>
                                                        <p className="text-emerald-400 font-bold text-lg">₹{sale.grandTotal.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-violet-300/60">No sales history found.</div>
                                        )
                                    )}
                                </div>

                                <Dialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
                                    <DialogContent className="bg-slate-900 border-violet-400/20 text-white">
                                        <DialogHeader>
                                            <DialogTitle>Sell Item: {selectedItem?.itemName}</DialogTitle>
                                            <DialogDescription className="text-violet-300">
                                                Confirm sale details.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Quantity Sold</Label>
                                                <Input
                                                    type="number"
                                                    value={sellQuantity}
                                                    onChange={(e) => setSellQuantity(e.target.value)}
                                                    className="bg-white/5 border-violet-400/30 text-white"
                                                    min="1"
                                                    max={selectedItem?.quantity}
                                                />
                                                <div className="space-y-2">
                                                    <Label>State of Supply</Label>
                                                    <Select value={sellStateOfSupply} onValueChange={setSellStateOfSupply}>
                                                        <SelectTrigger className="bg-white/5 border-violet-400/30 text-white">
                                                            <SelectValue placeholder="Select State" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-violet-400/20 text-white max-h-[300px]">
                                                            {INDIAN_STATES.map(state => (
                                                                <SelectItem key={state} value={state}>{state}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <p className="text-xs text-violet-400">Stock: {selectedItem?.quantity}</p>
                                            </div>

                                            {/* Preview Calculation */}
                                            {(() => {
                                                const qty = parseInt(sellQuantity) || 0;
                                                const price = selectedItem?.price || 0;
                                                const subtotal = qty * price;
                                                const itemState = selectedItem?.stateOfSupply || "";
                                                const sellState = sellStateOfSupply;
                                                const isInterState = itemState && sellState && itemState !== sellState;

                                                // Get the GST rate from item (prefer gstRate, fallback to combined old rates)
                                                const itemGstRate = selectedItem?.gstRate || ((selectedItem?.sgst || 0) + (selectedItem?.cgst || 0) + (selectedItem?.igst || 0));

                                                // Inter-state: IGST at item's GST rate, Intra-state: Split GST 50-50
                                                const igstRate = isInterState ? itemGstRate : 0;
                                                const sgstRate = isInterState ? 0 : itemGstRate / 2;
                                                const cgstRate = isInterState ? 0 : itemGstRate / 2;

                                                const igstAmount = (subtotal * igstRate) / 100;
                                                const sgstAmount = (subtotal * sgstRate) / 100;
                                                const cgstAmount = (subtotal * cgstRate) / 100;
                                                const totalTax = igstAmount + sgstAmount + cgstAmount;
                                                const grandTotal = subtotal + totalTax;

                                                return (
                                                    <div className="bg-white/5 p-4 rounded-lg space-y-2 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-violet-300">Subtotal ({sellQuantity} x ₹{price})</span>
                                                            <span>₹{subtotal.toFixed(2)}</span>
                                                        </div>

                                                        {/* State comparison indicator */}
                                                        {itemState && sellState && (
                                                            <div className={`text-xs py-1 px-2 rounded ${isInterState ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                                {isInterState
                                                                    ? `Inter-State Sale: ${itemState} → ${sellState} (IGST applies)`
                                                                    : `Intra-State Sale: ${itemState} (SGST + CGST applies)`
                                                                }
                                                            </div>
                                                        )}

                                                        {/* SGST - Intra-state only */}
                                                        {sgstRate > 0 && (
                                                            <div className="flex justify-between text-violet-400/80">
                                                                <span>SGST ({sgstRate.toFixed(1)}%)</span>
                                                                <span>₹{sgstAmount.toFixed(2)}</span>
                                                            </div>
                                                        )}

                                                        {/* CGST - Intra-state only */}
                                                        {cgstRate > 0 && (
                                                            <div className="flex justify-between text-violet-400/80">
                                                                <span>CGST ({cgstRate.toFixed(1)}%)</span>
                                                                <span>₹{cgstAmount.toFixed(2)}</span>
                                                            </div>
                                                        )}

                                                        {/* IGST - Inter-state only */}
                                                        {igstRate > 0 && (
                                                            <div className="flex justify-between text-orange-400/80">
                                                                <span>IGST ({igstRate}%)</span>
                                                                <span>₹{igstAmount.toFixed(2)}</span>
                                                            </div>
                                                        )}

                                                        {/* No tax case */}
                                                        {itemGstRate === 0 && !isInterState && (
                                                            <div className="flex justify-between text-violet-400/40 italic">
                                                                <span>No Tax (0% GST)</span>
                                                                <span>₹0.00</span>
                                                            </div>
                                                        )}

                                                        <div className="border-t border-violet-400/20 pt-2 flex justify-between font-bold text-emerald-400">
                                                            <span>Grand Total</span>
                                                            <span>₹{grandTotal.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsSellDialogOpen(false)} className="border-violet-400/30 text-violet-300 hover:bg-white/5">Cancel</Button>
                                            <Button onClick={submitSell} disabled={isSelling} className="bg-violet-600 hover:bg-violet-500">
                                                {isSelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
                                                Confirm Sale
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="add">
                        <Card className="backdrop-blur-2xl bg-white/10 border border-violet-400/20 rounded-3xl">
                            <CardHeader>
                                <CardTitle className="text-2xl font-bold text-violet-100">Add New Item</CardTitle>
                                <CardDescription className="text-violet-300/70">Add a new item to your inventory</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-violet-100">Item Name</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={formData.itemName}
                                            onChange={(e) => handleInputChange("itemName", e.target.value)}
                                            className="bg-white/5 border-violet-400/30 text-violet-100"
                                            placeholder="e.g. Office Chair"
                                        />
                                        <VoiceButton
                                            onTranscript={(text) => handleInputChange("itemName", text)}
                                            onClear={() => handleInputChange("itemName", "")}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">SKU</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={formData.sku}
                                                onChange={(e) => handleInputChange("sku", e.target.value)}
                                                className="bg-white/5 border-violet-400/30 text-violet-100"
                                                placeholder="e.g. FURN-001"
                                            />
                                            <VoiceButton
                                                onTranscript={(text) => handleInputChange("sku", text)}
                                                onClear={() => handleInputChange("sku", "")}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">HSN Code</Label>
                                        <Input
                                            value={formData.hsnCode}
                                            onChange={(e) => handleInputChange("hsnCode", e.target.value)}
                                            className="bg-white/5 border-violet-400/30 text-violet-100"
                                            placeholder="e.g. 9403"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">Unit</Label>
                                        <Select value={formData.unit} onValueChange={(val) => handleInputChange("unit", val)}>
                                            <SelectTrigger className="bg-white/5 border-violet-400/30 text-violet-100 h-10">
                                                <SelectValue placeholder="Select Unit" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-violet-400/20 text-white">
                                                {UNITS.map(unit => (
                                                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-violet-100">Category</Label>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsAddingCategory(!isAddingCategory)}
                                                className="h-6 text-violet-400 hover:text-violet-200"
                                            >
                                                {isAddingCategory ? "Cancel" : "+ Add New"}
                                            </Button>
                                        </div>

                                        {isAddingCategory ? (
                                            <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <Input
                                                    value={newCategoryName}
                                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                                    placeholder="Category name"
                                                    className="bg-white/5 border-violet-400/30 text-violet-100 h-10"
                                                />
                                                <Button
                                                    onClick={handleAddCategory}
                                                    disabled={isSavingCategory || !newCategoryName.trim()}
                                                    className="bg-violet-600 hover:bg-violet-500 h-10 px-3"
                                                >
                                                    {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                                                </Button>
                                            </div>
                                        ) : (
                                            <Select value={formData.category} onValueChange={(val) => handleInputChange("category", val)}>
                                                <SelectTrigger className="bg-white/5 border-violet-400/30 text-violet-100 h-10">
                                                    <SelectValue placeholder="Select Category" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-violet-400/20 text-white">
                                                    <SelectItem value="General">General</SelectItem>
                                                    <SelectItem value="Electronics">Electronics</SelectItem>
                                                    <SelectItem value="Furniture">Furniture</SelectItem>
                                                    <SelectItem value="Stationery">Stationery</SelectItem>
                                                    {customCategories.map(cat => (
                                                        <div key={cat._id} className="flex items-center justify-between px-2 hover:bg-white/10 transition-colors">
                                                            <SelectItem value={cat.name} className="flex-1">{cat.name}</SelectItem>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleDeleteCategory(cat._id);
                                                                }}
                                                                className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">Price (₹)</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={formData.price}
                                                onChange={(e) => handleInputChange("price", e.target.value)}
                                                className="bg-white/5 border-violet-400/30 text-violet-100"
                                                placeholder="0.00"
                                            />
                                            <VoiceButton
                                                onTranscript={(text) => handleInputChange("price", text)}
                                                onClear={() => handleInputChange("price", "")}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">State of Supply</Label>
                                        <Select
                                            value={formData.stateOfSupply}
                                            onValueChange={(val) => handleInputChange("stateOfSupply", val)}
                                        >
                                            <SelectTrigger className="bg-white/5 border-violet-400/30 text-violet-100 h-10">
                                                <SelectValue placeholder="Select State" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-violet-400/20 text-white max-h-[300px]">
                                                {INDIAN_STATES.map(state => (
                                                    <SelectItem key={state} value={state}>{state}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-violet-100">Quantity</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={formData.quantity}
                                                onChange={(e) => handleInputChange("quantity", e.target.value)}
                                                className="bg-white/5 border-violet-400/30 text-violet-100"
                                                placeholder="0"
                                            />
                                            <VoiceButton
                                                onTranscript={(text) => handleInputChange("quantity", text)}
                                                onClear={() => handleInputChange("quantity", "")}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Tax Information Section */}
                                <div className="space-y-4 pt-4 border-t border-violet-400/10">
                                    <h3 className="text-lg font-bold text-violet-200 flex items-center gap-2">
                                        <Shield className="h-4 w-4" /> GST Rate
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label className="text-violet-100">GST Slab (%)</Label>
                                            <Select
                                                value={formData.gstRate}
                                                onValueChange={(val) => handleInputChange("gstRate", val)}
                                            >
                                                <SelectTrigger className="bg-white/5 border-violet-400/30 text-violet-100 h-10">
                                                    <SelectValue placeholder="Select GST Rate" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-violet-400/20 text-white">
                                                    {GST_SLABS.map(rate => (
                                                        <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label className="text-violet-100 opacity-60">Tax Split Preview</Label>
                                            <div className="bg-white/5 border border-violet-400/20 rounded-lg p-3 text-sm">
                                                <p className="text-violet-300/80">
                                                    <span className="font-semibold text-violet-200">Intra-State:</span> SGST {(parseFloat(formData.gstRate) / 2).toFixed(1)}% + CGST {(parseFloat(formData.gstRate) / 2).toFixed(1)}%
                                                </p>
                                                <p className="text-violet-300/80 mt-1">
                                                    <span className="font-semibold text-violet-200">Inter-State:</span> IGST {formData.gstRate}%
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button onClick={addItem} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold h-12 rounded-xl mt-4">
                                    Add Item
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Purchase Invoice Tab */}
                    <TabsContent value="purchase">
                        <div className="grid grid-cols-3 gap-6">
                            {/* Left Column - Form & Items (2 cols) */}
                            <div className="col-span-2 space-y-6">
                                {/* Supplier Details */}
                                <Card className="backdrop-blur-2xl bg-white/10 border border-amber-400/20 rounded-3xl">
                                    <CardHeader>
                                        <CardTitle className="text-2xl font-bold text-amber-100 flex items-center gap-2">
                                            <FileText className="h-6 w-6 text-amber-400" />
                                            Purchase Invoice
                                        </CardTitle>
                                        <CardDescription className="text-amber-300/70">Enter supplier details and add items</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="text-lg font-bold text-amber-100">Buyer / Customer Details</h3>
                                                    <p className="text-xs text-amber-300/70">Used in the Bill To section of the invoice copy</p>
                                                </div>
                                                <Select
                                                    value={purchaseInvoice.customerType}
                                                    onValueChange={(val: 'B2B' | 'B2C') => setPurchaseInvoice(prev => ({
                                                        ...prev,
                                                        customerType: val,
                                                        customerGstin: val === 'B2C' ? '' : prev.customerGstin,
                                                    }))}
                                                >
                                                    <SelectTrigger className="w-[120px] bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white">
                                                        <SelectItem value="B2B">B2B</SelectItem>
                                                        <SelectItem value="B2C">B2C</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-amber-100">Customer Name *</Label>
                                                    <Input
                                                        value={purchaseInvoice.customerName}
                                                        onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, customerName: e.target.value }))}
                                                        className="bg-white/5 border-amber-400/30 text-amber-100"
                                                        placeholder="Customer name"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-amber-100">Phone Number</Label>
                                                    <Input
                                                        value={purchaseInvoice.customerPhone}
                                                        onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, customerPhone: e.target.value }))}
                                                        className="bg-white/5 border-amber-400/30 text-amber-100"
                                                        placeholder="Customer phone"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-amber-100">GSTIN {purchaseInvoice.customerType === 'B2B' ? '*' : '(optional)'}</Label>
                                                    <Input
                                                        value={purchaseInvoice.customerGstin}
                                                        onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, customerGstin: e.target.value.toUpperCase() }))}
                                                        className="bg-white/5 border-amber-400/30 text-amber-100"
                                                        placeholder={purchaseInvoice.customerType === 'B2B' ? "Customer GSTIN" : "Optional for B2C"}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-amber-100 flex items-center gap-1.5">
                                                        <Layout className="h-4 w-4 text-amber-400" />
                                                        Theme Template
                                                    </Label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsEditingPurchaseTemplate(false);
                                                            setIsPurchaseTemplateModalOpen(true);
                                                        }}
                                                        className="text-xs font-medium text-amber-400 hover:text-amber-300 underline"
                                                    >
                                                        Manage
                                                    </button>
                                                </div>
                                                <Select
                                                    value={selectedTemplateId}
                                                    onValueChange={(val) => setSelectedTemplateId(val)}
                                                >
                                                    <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue placeholder="Select Template" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white max-h-48">
                                                        {userTemplates.length === 0 ? (
                                                            <SelectItem value="none" disabled>Default Template</SelectItem>
                                                        ) : (
                                                            userTemplates.map(t => (
                                                                <SelectItem key={t._id} value={t._id}>
                                                                    {t.name} {t.isDefault ? "(Default)" : ""}
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Payment Method</Label>
                                                <Select
                                                    value={purchaseInvoice.paymentMethod}
                                                    onValueChange={(val: PurchaseInvoice["paymentMethod"]) => setPurchaseInvoice(prev => ({ ...prev, paymentMethod: val }))}
                                                >
                                                    <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white">
                                                        {PAYMENT_METHODS.map(method => (
                                                            <SelectItem key={method} value={method}>{method}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Supplier Name *</Label>
                                                <Input
                                                    value={purchaseInvoice.supplierName}
                                                    onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, supplierName: e.target.value }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="Supplier name"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Phone</Label>
                                                <Input
                                                    value={purchaseInvoice.phone}
                                                    onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, phone: e.target.value }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="Phone number"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">GSTIN</Label>
                                                <Input
                                                    value={purchaseInvoice.gstin}
                                                    onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, gstin: e.target.value }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="Supplier GSTIN"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">State of Supply *</Label>
                                                <Select
                                                    value={purchaseInvoice.stateOfSupply}
                                                    onValueChange={(val) => setPurchaseInvoice(prev => ({ ...prev, stateOfSupply: val }))}
                                                >
                                                    <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue placeholder="Select State" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white max-h-[300px]">
                                                        {INDIAN_STATES.map(state => (
                                                            <SelectItem key={state} value={state}>{state}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Bill No</Label>
                                                <Input
                                                    value={purchaseInvoice.billNo}
                                                    onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, billNo: e.target.value }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Bill Date</Label>
                                                <Input
                                                    type="date"
                                                    value={purchaseInvoice.billDate}
                                                    onChange={(e) => setPurchaseInvoice(prev => ({ ...prev, billDate: e.target.value }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                />
                                            </div>
                                        </div>

                                        {/* Inter/Intra state indicator */}
                                        {purchaseInvoice.stateOfSupply && (
                                            <div className={`flex items-center gap-2 text-xs py-2 px-3 rounded-lg ${isInterStatePurchase()
                                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                }`}>
                                                <AlertCircle className="h-3 w-3" />
                                                {isInterStatePurchase()
                                                    ? `Inter-State: ${purchaseInvoice.stateOfSupply} → ${BUSINESS_STATE} (IGST)`
                                                    : `Intra-State: ${BUSINESS_STATE} (SGST + CGST)`
                                                }
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Add Item Form */}
                                <Card className="backdrop-blur-2xl bg-white/10 border border-amber-400/20 rounded-3xl">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-bold text-amber-100 flex items-center gap-2">
                                            <Plus className="h-5 w-5 text-amber-400" />
                                            Add Item
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Item Name *</Label>
                                                <Input
                                                    value={purchaseNewItem.itemName}
                                                    onChange={(e) => applyHsnSacAutomation('itemName', e.target.value)}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="Item name"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Item Code</Label>
                                                <Input
                                                    value={purchaseNewItem.itemCode}
                                                    onChange={(e) => applyHsnSacAutomation('itemCode', e.target.value)}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="SKU / Code"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">HSN / SAC Code</Label>
                                                <div className="grid grid-cols-[92px_1fr] gap-2">
                                                    <Select
                                                        value={purchaseNewItem.codeType || 'HSN'}
                                                        onValueChange={(val: 'HSN' | 'SAC') => setPurchaseNewItem(prev => ({ ...prev, codeType: val }))}
                                                    >
                                                        <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-amber-400/20 text-white">
                                                            <SelectItem value="HSN">HSN</SelectItem>
                                                            <SelectItem value="SAC">SAC</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        value={purchaseNewItem.hsnCode}
                                                        onChange={(e) => setPurchaseNewItem(prev => ({ ...prev, hsnCode: e.target.value }))}
                                                        className="bg-white/5 border-amber-400/30 text-amber-100"
                                                        placeholder={purchaseNewItem.codeType === 'SAC' ? "SAC code" : "Auto/manual HSN"}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Qty *</Label>
                                                <Input
                                                    type="number"
                                                    value={purchaseNewItem.quantity}
                                                    onChange={(e) => setPurchaseNewItem(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    min="1"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Unit</Label>
                                                <Select
                                                    value={purchaseNewItem.unit}
                                                    onValueChange={(val) => setPurchaseNewItem(prev => ({ ...prev, unit: val }))}
                                                >
                                                    <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white">
                                                        {UNITS.map(u => (
                                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Price/Unit *</Label>
                                                <Input
                                                    type="number"
                                                    value={purchaseNewItem.pricePerUnit}
                                                    onChange={(e) => setPurchaseNewItem(prev => ({ ...prev, pricePerUnit: Number(e.target.value) }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Discount %</Label>
                                                <Input
                                                    type="number"
                                                    value={purchaseNewItem.discountPercent}
                                                    onChange={(e) => setPurchaseNewItem(prev => ({ ...prev, discountPercent: Number(e.target.value) }))}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 items-end">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">GST %</Label>
                                                <Select
                                                    value={String(purchaseNewItem.taxPercent)}
                                                    onValueChange={(val) => setPurchaseNewItem(prev => ({ ...prev, taxPercent: Number(val) }))}
                                                >
                                                    <SelectTrigger className="bg-white/5 border-amber-400/30 text-amber-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-amber-400/20 text-white">
                                                        {GST_SLABS.map(rate => (
                                                            <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center gap-2 pb-1">
                                                <input
                                                    type="checkbox"
                                                    checked={purchaseNewItem.priceWithTax}
                                                    onChange={(e) => setPurchaseNewItem(prev => ({ ...prev, priceWithTax: e.target.checked }))}
                                                    className="rounded border-amber-400/30"
                                                />
                                                <Label className="text-amber-100 text-sm">Price includes tax</Label>
                                            </div>
                                            <Button
                                                onClick={addPurchaseItem}
                                                className="bg-amber-600 hover:bg-amber-500 text-white font-bold h-10 rounded-xl"
                                            >
                                                <Plus className="h-4 w-4 mr-2" /> Add Item
                                            </Button>
                                        </div>

                                        {/* Preview calculation */}
                                        {(purchaseNewItem.pricePerUnit || 0) > 0 && purchaseInvoice.stateOfSupply && (
                                            <div className="bg-amber-500/5 border border-amber-400/10 rounded-lg p-3 text-sm">
                                                {(() => {
                                                    const calc = calculatePurchaseItemAmounts(purchaseNewItem);
                                                    return (
                                                        <div className="flex gap-4 text-amber-200/80">
                                                            <span>Base: ₹{((purchaseNewItem.quantity || 0) * (purchaseNewItem.pricePerUnit || 0)).toFixed(2)}</span>
                                                            {(calc.discountAmount || 0) > 0 && <span>Disc: -₹{calc.discountAmount?.toFixed(2)}</span>}
                                                            {(calc.sgstAmount || 0) > 0 && <span>SGST: ₹{calc.sgstAmount?.toFixed(2)}</span>}
                                                            {(calc.cgstAmount || 0) > 0 && <span>CGST: ₹{calc.cgstAmount?.toFixed(2)}</span>}
                                                            {(calc.igstAmount || 0) > 0 && <span>IGST: ₹{calc.igstAmount?.toFixed(2)}</span>}
                                                            <span className="font-bold text-amber-100">Total: ₹{calc.amount?.toFixed(2)}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Items Table */}
                                {purchaseInvoice.items.length > 0 && (
                                    <Card className="backdrop-blur-2xl bg-white/10 border border-amber-400/20 rounded-3xl">
                                        <CardHeader>
                                            <CardTitle className="text-lg font-bold text-amber-100">
                                                Items ({purchaseInvoice.items.length})
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-amber-400/20 text-amber-300/70">
                                                            <th className="text-left py-2 px-2">#</th>
                                                            <th className="text-left py-2 px-2">Item</th>
                                                            <th className="text-right py-2 px-2">Qty</th>
                                                            <th className="text-right py-2 px-2">Price</th>
                                                            <th className="text-right py-2 px-2">Disc</th>
                                                            <th className="text-right py-2 px-2">Tax</th>
                                                            <th className="text-right py-2 px-2">Amount</th>
                                                            <th className="text-center py-2 px-2"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {purchaseInvoice.items.map((item, idx) => (
                                                            <tr key={item.id} className="border-b border-amber-400/10 hover:bg-white/5">
                                                                <td className="py-2 px-2 text-amber-300/60">{idx + 1}</td>
                                                                <td className="py-2 px-2">
                                                                    <div className="text-amber-100 font-medium">{item.itemName}</div>
                                                                    <div className="text-amber-300/50 text-xs">
                                                                        {item.itemCode && `${item.itemCode} • `}{item.hsnCode && `${item.codeType || 'HSN'}: ${item.hsnCode}`}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2 px-2 text-right text-amber-100">{item.quantity} {item.unit}</td>
                                                                <td className="py-2 px-2 text-right text-amber-100">₹{item.pricePerUnit.toFixed(2)}</td>
                                                                <td className="py-2 px-2 text-right text-amber-200/70">
                                                                    {item.discountAmount > 0 ? `-₹${item.discountAmount.toFixed(2)}` : '-'}
                                                                </td>
                                                                <td className="py-2 px-2 text-right">
                                                                    <div className="text-amber-200/70">₹{item.taxAmount.toFixed(2)}</div>
                                                                    <div className="text-amber-400/50 text-xs">
                                                                        {item.isInterState
                                                                            ? `IGST ${item.igstRate}%`
                                                                            : `S${item.sgstRate}% C${item.cgstRate}%`
                                                                        }
                                                                    </div>
                                                                </td>
                                                                <td className="py-2 px-2 text-right font-bold text-amber-100">₹{item.amount.toFixed(2)}</td>
                                                                <td className="py-2 px-2 text-center">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => removePurchaseItem(item.id)}
                                                                        className="text-red-300 hover:text-red-100 hover:bg-red-500/20 h-7 w-7 p-0"
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            {/* Right Column - Summary Panel (1 col) */}
                            <div className="col-span-1 space-y-6">
                                <Card className="backdrop-blur-2xl bg-white/10 border border-amber-400/20 rounded-3xl sticky top-6">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-bold text-amber-100 flex items-center gap-2">
                                            <Calculator className="h-5 w-5 text-amber-400" />
                                            Summary
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* Subtotal */}
                                        <div className="flex justify-between text-amber-200/80">
                                            <span>Subtotal</span>
                                            <span>₹{purchaseInvoice.subtotal.toFixed(2)}</span>
                                        </div>

                                        {/* GST Breakdown */}
                                        {purchaseInvoice.totalSgst > 0 && (
                                            <div className="flex justify-between text-amber-300/70 text-sm">
                                                <span>SGST</span>
                                                <span>₹{purchaseInvoice.totalSgst.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {purchaseInvoice.totalCgst > 0 && (
                                            <div className="flex justify-between text-amber-300/70 text-sm">
                                                <span>CGST</span>
                                                <span>₹{purchaseInvoice.totalCgst.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {purchaseInvoice.totalIgst > 0 && (
                                            <div className="flex justify-between text-orange-300/70 text-sm">
                                                <span>IGST</span>
                                                <span>₹{purchaseInvoice.totalIgst.toFixed(2)}</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between text-amber-200/80 text-sm">
                                            <span>Total Tax</span>
                                            <span>₹{purchaseInvoice.totalTax.toFixed(2)}</span>
                                        </div>

                                        <div className="border-t border-amber-400/20 pt-3 flex justify-between font-bold text-xl text-amber-100">
                                            <span className="flex items-center gap-1"><IndianRupee className="h-5 w-5" /> Total</span>
                                            <span>₹{purchaseInvoice.total.toFixed(2)}</span>
                                        </div>

                                        {/* Paid / Balance */}
                                        <div className="border-t border-amber-400/20 pt-3 space-y-3">
                                            <div className="space-y-2">
                                                <Label className="text-amber-100">Amount Paid</Label>
                                                <Input
                                                    type="number"
                                                    value={purchaseInvoice.paid || ''}
                                                    onChange={(e) => {
                                                        const paid = Number(e.target.value) || 0;
                                                        setPurchaseInvoice(prev => ({
                                                            ...prev,
                                                            paid,
                                                            balance: prev.total - paid,
                                                        }));
                                                    }}
                                                    className="bg-white/5 border-amber-400/30 text-amber-100"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-amber-300/70">Balance Due</span>
                                                <span className={`font-bold ${purchaseInvoice.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    ₹{purchaseInvoice.balance.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="border-t border-amber-400/20 pt-3 space-y-2">
                                            <Button
                                                onClick={savePurchaseInvoice}
                                                disabled={isPurchaseSaving || purchaseInvoice.items.length === 0}
                                                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-12 rounded-xl"
                                            >
                                                {isPurchaseSaving ? (
                                                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                                                ) : (
                                                    <><Save className="h-4 w-4 mr-2" /> Save Purchase Invoice</>
                                                )}
                                            </Button>

                                            <div className="grid grid-cols-2 gap-2">
                                                <Button onClick={printPurchaseInvoice} variant="outline" className="py-2 bg-white/5 border-amber-400/30 text-amber-200 hover:bg-white/10 text-sm rounded-xl">
                                                    <Printer className="h-4 w-4 mr-1" />
                                                    Print
                                                </Button>
                                                <Button onClick={resetPurchaseForm} variant="outline" className="py-2 bg-white/5 border-amber-400/30 text-amber-200 hover:bg-white/10 text-sm rounded-xl">
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                    Clear
                                                </Button>
                                            </div>

                                            <button
                                                onClick={sharePurchaseOnWhatsApp}
                                                className="w-full py-3 bg-[#25D366]/10 text-[#25D366] rounded-xl font-bold hover:bg-[#25D366]/20 transition-all duration-300 border border-[#25D366]/30 hover:border-[#25D366]/50 flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/10"
                                            >
                                                <MessageCircle className="h-5 w-5" />
                                                Share on WhatsApp
                                            </button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Purchase Invoice History Section */}
                            <Card className="col-span-3 mt-8 backdrop-blur-2xl bg-white/10 border border-amber-400/20 rounded-3xl p-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-amber-100 flex items-center gap-2">
                                            <FileText className="h-6 w-6 text-amber-400" />
                                            Purchase Invoice History
                                        </h3>
                                        <p className="text-amber-300/70 text-xs mt-1">
                                            {purchaseInvoices.length} purchase bill{purchaseInvoices.length !== 1 ? 's' : ''} recorded
                                        </p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                                        <div className="relative w-full md:w-72">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-300/60" />
                                            <Input
                                                type="text"
                                                placeholder="Search by Bill No, Supplier..."
                                                value={purchaseSearchTerm}
                                                onChange={(e) => setPurchaseSearchTerm(e.target.value)}
                                                className="pl-9 bg-white/5 border-amber-400/30 text-amber-100 placeholder:text-amber-300/50 rounded-xl"
                                            />
                                        </div>
                                        <Button
                                            onClick={exportPurchaseHistoryToCSV}
                                            className="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold flex items-center gap-2 shadow-sm transition-all"
                                        >
                                            <Download className="h-4 w-4" />
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>

                                {/* Summary Stats */}
                                {purchaseInvoices.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                        <div className="bg-white/5 border border-amber-400/10 rounded-2xl p-4">
                                            <p className="text-xs text-amber-300/70 uppercase font-medium">Total Bills</p>
                                            <p className="text-2xl font-bold text-amber-100">{purchaseInvoices.length}</p>
                                        </div>
                                        <div className="bg-white/5 border border-amber-400/10 rounded-2xl p-4">
                                            <p className="text-xs text-amber-300/70 uppercase font-medium">Total Purchased Value</p>
                                            <p className="text-2xl font-bold text-amber-400">
                                                ₹{purchaseInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="bg-white/5 border border-amber-400/10 rounded-2xl p-4">
                                            <p className="text-xs text-amber-300/70 uppercase font-medium">Total Balance Due</p>
                                            <p className="text-2xl font-bold text-rose-400">
                                                ₹{purchaseInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* History List */}
                                {(() => {
                                    const query = purchaseSearchTerm.toLowerCase().trim();
                                    const filtered = purchaseInvoices.filter(inv => {
                                        if (!query) return true;
                                        return [
                                            inv.billNo,
                                            inv.supplierName,
                                            inv.phone,
                                            inv.gstin,
                                            inv.customerName,
                                            inv.stateOfSupply,
                                            inv.billDate
                                        ].some(v => String(v || '').toLowerCase().includes(query));
                                    });

                                    if (filtered.length === 0) {
                                        return (
                                            <div className="text-center py-12 text-amber-300/60 bg-white/5 rounded-2xl border border-amber-400/10">
                                                <FileText className="h-12 w-12 text-amber-400/40 mx-auto mb-3" />
                                                <p className="text-base font-semibold">No purchase invoices found</p>
                                                <p className="text-xs mt-1">Create your first purchase bill above to see history</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                                            {filtered.map((inv) => {
                                                const isPaid = (inv.balance || 0) <= 0;
                                                const isPartial = (inv.paid || 0) > 0 && (inv.balance || 0) > 0;
                                                return (
                                                    <div
                                                        key={inv._id}
                                                        className="bg-white/5 border border-amber-400/20 rounded-2xl p-5 hover:border-amber-400/40 transition-all shadow-md"
                                                    >
                                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                            <div className="space-y-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-bold text-lg text-amber-100">{inv.billNo}</span>
                                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                        PURCHASE BILL
                                                                    </span>
                                                                    {isPaid ? (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                                            Paid
                                                                        </span>
                                                                    ) : isPartial ? (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                            Partial
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                                                            Unpaid
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <p className="text-sm font-medium text-white">
                                                                    Supplier: <span className="text-amber-200">{inv.supplierName}</span>
                                                                    {inv.phone ? ` (${inv.phone})` : ''}
                                                                </p>
                                                                <p className="text-xs text-amber-300/70">
                                                                    Date: {inv.billDate} | State: {inv.stateOfSupply} | Payment: {inv.paymentMethod || 'Cash'}
                                                                    {inv.customerName ? ` | Customer: ${inv.customerName}` : ''}
                                                                </p>
                                                                <p className="text-xs text-amber-400/60 mt-1">
                                                                    {inv.items?.length || 0} items included
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 border-white/10 pt-3 lg:pt-0">
                                                                <div className="text-left sm:text-right">
                                                                    <p className="text-xl font-bold text-emerald-400">₹{(inv.total || 0).toFixed(2)}</p>
                                                                    {(inv.balance || 0) > 0 ? (
                                                                        <p className="text-xs text-rose-400 font-semibold">Due: ₹{(inv.balance || 0).toFixed(2)}</p>
                                                                    ) : (
                                                                        <p className="text-xs text-emerald-400 font-medium">Fully Paid</p>
                                                                    )}
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => window.open(`/purchase-invoice/view/${inv._id}`, '_blank')}
                                                                        className="bg-white/5 border-amber-400/30 text-amber-200 hover:bg-amber-400/20 hover:text-amber-100 text-xs rounded-xl flex items-center px-3 py-1.5 font-medium transition-colors"
                                                                    >
                                                                        <Printer className="h-3.5 w-3.5 mr-1.5" />
                                                                        View / Print
                                                                    </Button>

                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => downloadPurchaseInvoicePDF(inv)}
                                                                        className="bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-100 text-xs rounded-xl flex items-center px-3 py-1.5 font-medium transition-colors"
                                                                    >
                                                                        <Download className="h-3.5 w-3.5 mr-1.5" />
                                                                        Download PDF
                                                                    </Button>

                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => shareHistoryPurchaseOnWhatsApp(inv)}
                                                                        className="bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 hover:text-green-300 text-xs rounded-xl flex items-center px-3 py-1.5 font-medium transition-colors"
                                                                    >
                                                                        <Share2 className="h-3.5 w-3.5 mr-1.5" />
                                                                        Share
                                                                    </Button>

                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => deletePurchaseInvoice(inv._id)}
                                                                        className="bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 text-xs rounded-xl flex items-center px-3 py-1.5 font-medium transition-colors"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                                                        Delete
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="voice">
                        <Card className="backdrop-blur-2xl bg-white/10 border border-violet-400/20 rounded-3xl overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-violet-500/50 to-transparent"></div>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-2xl font-bold text-violet-100 flex items-center gap-3">
                                    <div className="p-2 bg-violet-500/20 rounded-lg">
                                        <Mic className="h-6 w-6 text-violet-400" />
                                    </div>
                                    Voice Inventory Sales
                                </CardTitle>
                                <CardDescription className="text-violet-300/70">
                                    Dictate sales to process them automatically (e.g., "Sell 5 units of [Item Name]")
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-violet-200 font-medium">Live Transcript</Label>
                                        <VoiceButton
                                            onTranscript={(text) => setTranscript(prev => prev + " " + text)}
                                            onClear={() => setTranscript("")}
                                        />
                                    </div>
                                    <textarea
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        placeholder="Speak now or type commands here... e.g. 'Sell 2 MacBook Pro'"
                                        className="w-full h-48 bg-white/5 border border-violet-400/20 rounded-2xl p-6 text-violet-100 placeholder:text-violet-300/20 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all resize-none text-lg leading-relaxed"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <Button
                                        onClick={handleVoiceApply}
                                        disabled={isProcessingVoice || !transcript.trim()}
                                        className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold h-14 rounded-2xl shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
                                    >
                                        {isProcessingVoice ? (
                                            <>
                                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                                Processing Sales...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="h-5 w-5 mr-2" />
                                                Apply Voice Sales
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => setTranscript("")}
                                        className="h-14 px-8 border-violet-400/20 text-violet-300 hover:bg-white/5 rounded-2xl"
                                    >
                                        Clear
                                    </Button>
                                </div>

                                <div className="p-4 bg-violet-500/5 rounded-2xl border border-violet-400/10">
                                    <h4 className="text-sm font-semibold text-violet-300 mb-2 flex items-center gap-2">
                                        <Shield className="h-4 w-4" /> Usage Tips:
                                    </h4>
                                    <ul className="text-xs text-violet-300/60 space-y-1 ml-6 list-disc">
                                        <li>"Sell 10 units of Office Chairs"</li>
                                        <li>"Sale 5 MacBook Pro"</li>
                                        <li>"Sell 2 quantities of SKU-101"</li>
                                        <li>You can chain multiple commands by saying "and" or using dots.</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
                <AlertDialog open={isItemDeleteDialogOpen} onOpenChange={setIsItemDeleteDialogOpen}>
                    <AlertDialogContent className="bg-slate-900/95 backdrop-blur-xl border-emerald-500/20 text-emerald-50 max-w-md rounded-3xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
                                <Trash2 className="h-6 w-6 text-red-400" />
                                Delete Item?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-emerald-200/60 text-base">
                                This action cannot be undone. This will permanently delete the item from your inventory.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-3 mt-6">
                            <AlertDialogCancel className="bg-white/5 border-emerald-500/20 text-emerald-100 hover:bg-white/10 hover:text-white rounded-xl h-12 px-6">
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmDeleteItem}
                                className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white border-0 rounded-xl h-12 px-6 font-bold shadow-lg shadow-red-500/20"
                            >
                                Delete Permanently
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={isCategoryDeleteDialogOpen} onOpenChange={setIsCategoryDeleteDialogOpen}>
                    <AlertDialogContent className="bg-slate-900/95 backdrop-blur-xl border-emerald-500/20 text-emerald-50 max-w-md rounded-3xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
                                <Trash2 className="h-6 w-6 text-red-400" />
                                Delete Category?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-emerald-200/60 text-base">
                                Are you sure you want to delete this category? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-3 mt-6">
                            <AlertDialogCancel className="bg-white/5 border-emerald-500/20 text-emerald-100 hover:bg-white/10 hover:text-white rounded-xl h-12 px-6">
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmDeleteCategory}
                                className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white border-0 rounded-xl h-12 px-6 font-bold shadow-lg shadow-red-500/20"
                            >
                                Delete Category
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Purchase Invoice Template Manager Studio Modal */}
                <Dialog open={isPurchaseTemplateModalOpen} onOpenChange={setIsPurchaseTemplateModalOpen}>
                    <DialogContent className="bg-slate-900/95 backdrop-blur-2xl border-amber-500/30 text-white w-[96vw] max-w-[1400px] h-[92vh] max-h-[92vh] rounded-3xl p-0 overflow-hidden z-50 flex flex-col">
                        
                        {/* Editor Header Toolbar when editing */}
                        {isEditingPurchaseTemplate ? (
                            <div className="bg-slate-950 border-b border-slate-800 h-16 px-6 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsEditingPurchaseTemplate(false)}
                                        className="rounded-xl h-9 border-slate-700 bg-white/5 text-slate-200 hover:bg-white/10"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1" />
                                        Back to Templates
                                    </Button>
                                    <div>
                                        <h2 className="font-bold text-white text-base flex items-center gap-2">
                                            <Layout className="h-5 w-5 text-amber-400" />
                                            {editingTemplateId ? "Edit Purchase Invoice Design" : "Create Purchase Invoice Design"}
                                        </h2>
                                        <p className="text-xs text-slate-400 font-medium">Real-time A4 Studio Preview & Customization</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Input
                                        value={purchaseTemplateName}
                                        onChange={(e) => setPurchaseTemplateName(e.target.value)}
                                        placeholder="Template Name..."
                                        className="h-9 w-52 rounded-xl border-slate-700 bg-white/5 text-white"
                                    />
                                    <Button
                                        onClick={handleSavePurchaseTemplate}
                                        disabled={isSavingPurchaseTemplate}
                                        className="h-9 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold rounded-xl px-4 flex items-center gap-1.5"
                                    >
                                        {isSavingPurchaseTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Save Design
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-950 border-b border-slate-800 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-amber-500/20 rounded-2xl border border-amber-500/30">
                                        <Layout className="h-6 w-6 text-amber-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">Purchase Invoice Templates Studio</h2>
                                        <p className="text-xs text-slate-400">Design, customize, and set default bill layouts for inventory supplier receipts.</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="relative flex-1 md:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                            value={templateSearchTerm}
                                            onChange={(e) => setTemplateSearchTerm(e.target.value)}
                                            placeholder="Search templates..."
                                            className="pl-9 h-9 text-xs rounded-xl border-slate-800 bg-white/5 text-white"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleOpenNewPurchaseTemplate}
                                        className="h-9 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl px-4 flex items-center gap-1.5 shrink-0"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Create Template
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Main Modal Body */}
                        {isEditingPurchaseTemplate ? (
                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                                
                                {/* Left Column: 3 Configuration Tabs */}
                                <div className="lg:col-span-4 bg-white text-slate-900 border-r border-slate-200 flex flex-col overflow-hidden h-full">
                                    {/* Tabs Navigation */}
                                    <div className="grid grid-cols-3 border-b border-slate-200 text-center font-bold text-xs bg-slate-50 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setEditorTab("sections")}
                                            className={`py-3 flex flex-col items-center gap-1 transition-all ${
                                                editorTab === "sections" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"
                                            }`}
                                        >
                                            <FolderOpen className="h-4 w-4" />
                                            <span>Sections</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditorTab("ordering")}
                                            className={`py-3 flex flex-col items-center gap-1 transition-all ${
                                                editorTab === "ordering" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"
                                            }`}
                                        >
                                            <Sliders className="h-4 w-4" />
                                            <span>Layout</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditorTab("styles")}
                                            className={`py-3 flex flex-col items-center gap-1 transition-all ${
                                                editorTab === "styles" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"
                                            }`}
                                        >
                                            <Paintbrush className="h-4 w-4" />
                                            <span>Styles</span>
                                        </button>
                                    </div>

                                    {/* Config Content Panel */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-800">
                                        {editorTab === "sections" && (
                                            <div className="space-y-4">
                                                {/* Header Details Card */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <ImageIcon className="h-4 w-4 text-amber-600" />
                                                        Header & Logo Details
                                                    </h3>
                                                    <div className="space-y-2.5">
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">HEADER TITLE</Label>
                                                            <Input
                                                                value={purchaseConfig.header.headerTitle}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "headerTitle", e.target.value)}
                                                                placeholder="TAX INVOICE / PURCHASE BILL"
                                                                className="h-8 text-xs bg-slate-50 border-slate-200"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Logo</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.header.showLogo}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "showLogo", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        {purchaseConfig.header.showLogo && (
                                                            <>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo URL</Label>
                                                                    <Input
                                                                        value={purchaseConfig.header.logoUrl}
                                                                        onChange={(e) => updatePurchaseSubConfig("header", "logoUrl", e.target.value)}
                                                                        placeholder="Paste logo image url"
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo Position</Label>
                                                                    <Select value={purchaseConfig.header.logoPosition} onValueChange={(val) => updatePurchaseSubConfig("header", "logoPosition", val)}>
                                                                        <SelectTrigger className="h-8 text-xs">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                                                            <SelectItem value="left">Left</SelectItem>
                                                                            <SelectItem value="center">Center</SelectItem>
                                                                            <SelectItem value="right">Right</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo Size</Label>
                                                                    <Select value={purchaseConfig.header.logoSize} onValueChange={(val) => updatePurchaseSubConfig("header", "logoSize", val)}>
                                                                        <SelectTrigger className="h-8 text-xs">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                                                            <SelectItem value="small">Small</SelectItem>
                                                                            <SelectItem value="medium">Medium</SelectItem>
                                                                            <SelectItem value="large">Large</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Company Name</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.header.showCompanyName}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "showCompanyName", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Company Address</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.header.showAddress}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "showAddress", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Company Phone</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.header.showPhone}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "showPhone", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Company Email</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.header.showEmail}
                                                                onChange={(e) => updatePurchaseSubConfig("header", "showEmail", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                    </div>
                                                </Card>

                                                {/* Supplier (Vendor) Details */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <Building2 className="h-4 w-4 text-amber-600" />
                                                        Supplier (Vendor) Information
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {Object.keys(purchaseConfig.supplier).map((field) => (
                                                            <div key={field} className="flex items-center justify-between text-xs">
                                                                <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={(purchaseConfig.supplier as any)[field]}
                                                                    onChange={(e) => updatePurchaseSubConfig("supplier", field, e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>

                                                {/* Customer (Bill To) Details */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <User className="h-4 w-4 text-amber-600" />
                                                        Bill To (Customer) Details
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {Object.keys(purchaseConfig.customer).map((field) => (
                                                            <div key={field} className="flex items-center justify-between text-xs">
                                                                <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={(purchaseConfig.customer as any)[field]}
                                                                    onChange={(e) => updatePurchaseSubConfig("customer", field, e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>

                                                {/* Purchase Bill Meta Info & Custom Labels */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <FileText className="h-4 w-4 text-amber-600" />
                                                        Bill Info & Custom Labels
                                                    </h3>
                                                    <div className="space-y-3">
                                                        {[
                                                            { show: "showInvoiceNumber", label: "invoiceNumber", defaultLabel: "Bill Number" },
                                                            { show: "showInvoiceDate", label: "invoiceDate", defaultLabel: "Bill Date" },
                                                            { show: "showDueDate", label: "dueDate", defaultLabel: "Due Date" },
                                                            { show: "showPaymentTerms", label: "paymentTerms", defaultLabel: "Payment Terms" },
                                                            { show: "showOrderNumber", label: "orderNumber", defaultLabel: "PO / Ref No." },
                                                            { show: "showSalesperson", label: "salespersonName", defaultLabel: "Received By" }
                                                        ].map((item) => (
                                                            <div key={item.show} className="space-y-1 border-b border-slate-100 pb-2">
                                                                <div className="flex items-center justify-between">
                                                                    <Label className="font-semibold text-slate-700">{item.defaultLabel}</Label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={(purchaseConfig.invoiceInfo as any)[item.show]}
                                                                        onChange={(e) => updatePurchaseSubConfig("invoiceInfo", item.show, e.target.checked)}
                                                                        className="h-4 w-4 accent-amber-600"
                                                                    />
                                                                </div>
                                                                {(purchaseConfig.invoiceInfo as any)[item.show] && (
                                                                    <Input
                                                                        value={(purchaseConfig.invoiceInfo.labels as any)[item.label]}
                                                                        onChange={(e) => updatePurchaseLabel("invoiceInfo", item.label, e.target.value)}
                                                                        className="h-7 text-xs bg-slate-50"
                                                                        placeholder="Display Label"
                                                                    />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>

                                                {/* Items Table Columns */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <Package className="h-4 w-4 text-amber-600" />
                                                        Items Table Columns & Labels
                                                    </h3>
                                                    <div className="space-y-2.5">
                                                        {Object.keys(purchaseConfig.items.labels).map((col) => {
                                                            const isEnabled = purchaseConfig.items.columns.includes(col);
                                                            return (
                                                                <div key={col} className="space-y-1 border-b border-slate-100 pb-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <Label className="font-semibold text-slate-700 capitalize">{col}</Label>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isEnabled}
                                                                            onChange={(e) => {
                                                                                let cols = [...purchaseConfig.items.columns];
                                                                                if (e.target.checked) {
                                                                                    if (!cols.includes(col)) cols.push(col);
                                                                                } else {
                                                                                    cols = cols.filter(c => c !== col);
                                                                                }
                                                                                updatePurchaseSubConfig("items", "columns", cols);
                                                                            }}
                                                                            className="h-4 w-4 accent-amber-600"
                                                                        />
                                                                    </div>
                                                                    {isEnabled && (
                                                                        <Input
                                                                            value={(purchaseConfig.items.labels as any)[col]}
                                                                            onChange={(e) => updatePurchaseLabel("items", col, e.target.value)}
                                                                            className="h-7 text-xs bg-slate-50"
                                                                        />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </Card>

                                                {/* Tax Breakdown Summary */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <Calculator className="h-4 w-4 text-amber-600" />
                                                        Tax Summary Toggles
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {Object.keys(purchaseConfig.tax).map((tField) => (
                                                            <div key={tField} className="flex items-center justify-between text-xs">
                                                                <Label className="font-semibold text-slate-700 capitalize">{tField.replace("show", "Show ")}</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={(purchaseConfig.tax as any)[tField]}
                                                                    onChange={(e) => updatePurchaseSubConfig("tax", tField, e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>

                                                {/* Payment Summary */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <CheckCircle className="h-4 w-4 text-amber-600" />
                                                        Payment Status Toggles
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {Object.keys(purchaseConfig.payment).map((pField) => (
                                                            <div key={pField} className="flex items-center justify-between text-xs">
                                                                <Label className="font-semibold text-slate-700 capitalize">{pField.replace("show", "Show ")}</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={(purchaseConfig.payment as any)[pField]}
                                                                    onChange={(e) => updatePurchaseSubConfig("payment", pField, e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>

                                                {/* Notes & Terms */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3">
                                                        Notes & Terms Config
                                                    </h3>
                                                    <div className="space-y-3">
                                                        <div className="space-y-1.5 border-b border-slate-100 pb-2">
                                                            <div className="flex items-center justify-between">
                                                                <Label className="font-semibold text-slate-700">Show Notes</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={purchaseConfig.notes.show}
                                                                    onChange={(e) => updatePurchaseSubConfig("notes", "show", e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                            {purchaseConfig.notes.show && (
                                                                <>
                                                                    <Input
                                                                        value={purchaseConfig.notes.label}
                                                                        onChange={(e) => updatePurchaseSubConfig("notes", "label", e.target.value)}
                                                                        placeholder="Notes Title Label"
                                                                        className="h-7 text-xs bg-slate-50"
                                                                    />
                                                                    <Input
                                                                        value={purchaseConfig.notes.defaultText}
                                                                        onChange={(e) => updatePurchaseSubConfig("notes", "defaultText", e.target.value)}
                                                                        placeholder="Default Notes Content"
                                                                        className="h-8 text-xs bg-slate-50"
                                                                    />
                                                                </>
                                                            )}
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <Label className="font-semibold text-slate-700">Show Terms & Conditions</Label>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={purchaseConfig.terms.show}
                                                                    onChange={(e) => updatePurchaseSubConfig("terms", "show", e.target.checked)}
                                                                    className="h-4 w-4 accent-amber-600"
                                                                />
                                                            </div>
                                                            {purchaseConfig.terms.show && (
                                                                <>
                                                                    <Input
                                                                        value={purchaseConfig.terms.label}
                                                                        onChange={(e) => updatePurchaseSubConfig("terms", "label", e.target.value)}
                                                                        placeholder="Terms Title Label"
                                                                        className="h-7 text-xs bg-slate-50"
                                                                    />
                                                                    <Input
                                                                        value={purchaseConfig.terms.defaultText}
                                                                        onChange={(e) => updatePurchaseSubConfig("terms", "defaultText", e.target.value)}
                                                                        placeholder="Default Terms Content"
                                                                        className="h-8 text-xs bg-slate-50"
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Card>

                                                {/* Signature Section */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <PenTool className="h-4 w-4 text-amber-600" />
                                                        Authorized Signature & Stamp
                                                    </h3>
                                                    <div className="space-y-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Signature</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.signature.show}
                                                                onChange={(e) => updatePurchaseSubConfig("signature", "show", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        {purchaseConfig.signature.show && (
                                                            <>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500">SIGNATURE IMAGE URL</Label>
                                                                    <Input
                                                                        value={purchaseConfig.signature.imageUrl}
                                                                        onChange={(e) => updatePurchaseSubConfig("signature", "imageUrl", e.target.value)}
                                                                        placeholder="Paste signature PNG URL"
                                                                        className="h-7 text-xs"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500">SIGNATORY NAME</Label>
                                                                    <Input
                                                                        value={purchaseConfig.signature.name}
                                                                        onChange={(e) => updatePurchaseSubConfig("signature", "name", e.target.value)}
                                                                        className="h-7 text-xs"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label className="text-[10px] font-bold text-slate-500">DESIGNATION</Label>
                                                                    <Input
                                                                        value={purchaseConfig.signature.designation}
                                                                        onChange={(e) => updatePurchaseSubConfig("signature", "designation", e.target.value)}
                                                                        className="h-7 text-xs"
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </Card>

                                                {/* Footer Text */}
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3">
                                                        Footer Section
                                                    </h3>
                                                    <div className="space-y-2.5">
                                                        <div className="flex items-center justify-between">
                                                            <Label className="font-semibold text-slate-700">Show Footer</Label>
                                                            <input
                                                                type="checkbox"
                                                                checked={purchaseConfig.footer.show}
                                                                onChange={(e) => updatePurchaseSubConfig("footer", "show", e.target.checked)}
                                                                className="h-4 w-4 accent-amber-600"
                                                            />
                                                        </div>
                                                        {purchaseConfig.footer.show && (
                                                            <Input
                                                                value={purchaseConfig.footer.text}
                                                                onChange={(e) => updatePurchaseSubConfig("footer", "text", e.target.value)}
                                                                placeholder="Footer copyright/tagline text"
                                                                className="h-8 text-xs bg-slate-50"
                                                            />
                                                        )}
                                                    </div>
                                                </Card>
                                            </div>
                                        )}

                                        {editorTab === "ordering" && (
                                            <div className="space-y-3">
                                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
                                                    Drag and drop sections to change the sequence in which elements appear on the printed A4 purchase invoice.
                                                </div>
                                                <div className="space-y-2">
                                                    {purchaseConfig.sectionsOrder.map((sec, idx) => (
                                                        <div
                                                            key={sec}
                                                            draggable
                                                            onDragStart={() => { purchaseDragItem.current = idx; }}
                                                            onDragEnter={() => { purchaseDragOverItem.current = idx; }}
                                                            onDragEnd={handlePurchaseSort}
                                                            onDragOver={(e) => e.preventDefault()}
                                                            className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between cursor-move shadow-sm hover:border-amber-400 hover:shadow transition-all"
                                                        >
                                                            <span className="font-bold text-slate-800 text-xs capitalize flex items-center gap-2">
                                                                <span className="flex items-center justify-center bg-amber-100 rounded h-5 w-5 text-[10px] text-amber-800 font-extrabold">{idx + 1}</span>
                                                                {sec.replace(/([A-Z])/g, ' $1')}
                                                            </span>
                                                            <div className="space-y-0.5 opacity-60">
                                                                <div className="w-4 h-0.5 bg-slate-600"></div>
                                                                <div className="w-4 h-0.5 bg-slate-600"></div>
                                                                <div className="w-4 h-0.5 bg-slate-600"></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {editorTab === "styles" && (
                                            <div className="space-y-4">
                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                        <Palette className="h-4 w-4 text-amber-600" />
                                                        Color Theme Palette
                                                    </h3>
                                                    <div className="space-y-3">
                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Primary Color</Label>
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="color"
                                                                    value={purchaseConfig.design.primaryColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "primaryColor", e.target.value)}
                                                                    className="h-8 w-12 p-0 border-slate-200 rounded cursor-pointer"
                                                                />
                                                                <Input
                                                                    type="text"
                                                                    value={purchaseConfig.design.primaryColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "primaryColor", e.target.value)}
                                                                    className="h-8 flex-1 text-xs"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Secondary / Row Accent Color</Label>
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="color"
                                                                    value={purchaseConfig.design.secondaryColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "secondaryColor", e.target.value)}
                                                                    className="h-8 w-12 p-0 border-slate-200 rounded cursor-pointer"
                                                                />
                                                                <Input
                                                                    type="text"
                                                                    value={purchaseConfig.design.secondaryColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "secondaryColor", e.target.value)}
                                                                    className="h-8 flex-1 text-xs"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Text Color</Label>
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="color"
                                                                    value={purchaseConfig.design.textColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "textColor", e.target.value)}
                                                                    className="h-8 w-12 p-0 border-slate-200 rounded cursor-pointer"
                                                                />
                                                                <Input
                                                                    type="text"
                                                                    value={purchaseConfig.design.textColor}
                                                                    onChange={(e) => updatePurchaseSubConfig("design", "textColor", e.target.value)}
                                                                    className="h-8 flex-1 text-xs"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                                            {[
                                                                { name: "Amber Gold", hex: "#d97706" },
                                                                { name: "Emerald Green", hex: "#059669" },
                                                                { name: "Slate Gray", hex: "#475569" },
                                                                { name: "Royal Indigo", hex: "#4f46e5" },
                                                                { name: "Crimson Red", hex: "#dc2626" },
                                                                { name: "Purple", hex: "#7c3aed" }
                                                            ].map((c) => (
                                                                <button
                                                                    key={c.hex}
                                                                    type="button"
                                                                    onClick={() => updatePurchaseSubConfig("design", "primaryColor", c.hex)}
                                                                    className="w-6 h-6 rounded-full border border-white shadow-sm transition-transform hover:scale-110"
                                                                    style={{ backgroundColor: c.hex }}
                                                                    title={c.name}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </Card>

                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3">Typography & Base Size</h3>
                                                    <div className="space-y-3">
                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Font Family</Label>
                                                            <Select value={purchaseConfig.design.fontFamily} onValueChange={(val) => updatePurchaseSubConfig("design", "fontFamily", val)}>
                                                                <SelectTrigger className="h-8 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white text-slate-950 border-slate-200">
                                                                    {["Inter", "Roboto", "Poppins", "Open Sans", "Outfit", "Courier New"].map(font => (
                                                                        <SelectItem key={font} value={font}>{font}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Base Font Size (px)</Label>
                                                            <Select value={String(purchaseConfig.design.fontSize)} onValueChange={(val) => updatePurchaseSubConfig("design", "fontSize", Number(val))}>
                                                                <SelectTrigger className="h-8 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white text-slate-950 border-slate-200">
                                                                    <SelectItem value="10">10px (Compact)</SelectItem>
                                                                    <SelectItem value="12">12px (Regular)</SelectItem>
                                                                    <SelectItem value="14">14px (Large)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                </Card>

                                                <Card className="p-3.5 border-slate-200 shadow-none">
                                                    <h3 className="font-bold text-xs text-slate-900 border-b border-slate-100 pb-2 mb-3">Table Borders & Corners</h3>
                                                    <div className="space-y-3">
                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Border Style</Label>
                                                            <Select value={purchaseConfig.design.borderStyle} onValueChange={(val) => updatePurchaseSubConfig("design", "borderStyle", val)}>
                                                                <SelectTrigger className="h-8 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white text-slate-950 border-slate-200">
                                                                    <SelectItem value="none">No Borders</SelectItem>
                                                                    <SelectItem value="light">Light Borders</SelectItem>
                                                                    <SelectItem value="medium">Medium Borders</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="font-semibold text-slate-700">Corner Radius (px)</Label>
                                                            <Select value={String(purchaseConfig.design.cornerRadius)} onValueChange={(val) => updatePurchaseSubConfig("design", "cornerRadius", Number(val))}>
                                                                <SelectTrigger className="h-8 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white text-slate-950 border-slate-200">
                                                                    <SelectItem value="0">Square (0px)</SelectItem>
                                                                    <SelectItem value="4">Small (4px)</SelectItem>
                                                                    <SelectItem value="8">Medium (8px)</SelectItem>
                                                                    <SelectItem value="12">Large (12px)</SelectItem>
                                                                    <SelectItem value="16">Rounded (16px)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                </Card>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Real-Time Live A4 Purchase Invoice Sheet Preview */}
                                <div className="lg:col-span-8 bg-slate-100 p-6 overflow-y-auto flex justify-center h-full no-print">
                                    <div
                                        id="purchase-a4-preview"
                                        className="w-[210mm] min-h-[297mm] bg-white p-10 shadow-2xl relative border border-slate-300 rounded-sm text-slate-900"
                                        style={{
                                            fontFamily: purchaseConfig.design.fontFamily,
                                            fontSize: `${purchaseConfig.design.fontSize}px`,
                                            color: purchaseConfig.design.textColor,
                                            lineHeight: "1.5"
                                        }}
                                    >
                                        {/* Dynamic Styled Sections from sectionsOrder */}
                                        {purchaseConfig.sectionsOrder.map((sectionName) => {
                                            if (sectionName === "header") {
                                                const pos = purchaseConfig.header.logoPosition;
                                                const sz = purchaseConfig.header.logoSize;
                                                const logoHeight = sz === 'small' ? 'h-8' : sz === 'large' ? 'h-16' : 'h-11';
                                                
                                                return (
                                                    <div
                                                        key="header"
                                                        className={`p-6 -mx-10 -mt-10 rounded-t-sm mb-6 flex text-white ${
                                                            pos === 'center' ? 'flex-col items-center text-center justify-center' : pos === 'right' ? 'flex-row-reverse justify-between items-start' : 'flex-row justify-between items-start'
                                                        }`}
                                                        style={{ backgroundColor: purchaseConfig.design.primaryColor }}
                                                    >
                                                        <div className={`flex items-center gap-4 ${pos === 'center' ? 'flex-col' : ''}`}>
                                                            {purchaseConfig.header.showLogo && (
                                                                purchaseConfig.header.logoUrl ? (
                                                                    <img src={purchaseConfig.header.logoUrl} alt="Logo" className={`${logoHeight} w-auto object-contain rounded bg-white/10 p-1`} />
                                                                ) : (
                                                                    <div className={`${logoHeight} w-24 bg-white/20 border border-dashed border-white/40 rounded flex items-center justify-center text-[10px] font-bold text-white`}>
                                                                        LOGO
                                                                    </div>
                                                                )
                                                            )}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{purchaseConfig.header.headerTitle || "TAX INVOICE / PURCHASE BILL"}</p>
                                                                {purchaseConfig.header.showCompanyName && <h2 className="text-2xl font-black text-white">SHREE ANDAL TRADERS</h2>}
                                                                {purchaseConfig.header.showAddress && <p className="text-xs opacity-90 mt-0.5">123 Market Road, Wholesale Hub, Chennai, TN 600001</p>}
                                                                <p className="text-xs opacity-90">
                                                                    {purchaseConfig.header.showPhone && "Ph: +91 98765 43210"}
                                                                    {purchaseConfig.header.showPhone && purchaseConfig.header.showEmail && " | "}
                                                                    {purchaseConfig.header.showEmail && "Email: contact@shreeandal.ai"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className={pos === 'center' ? 'mt-3 text-center' : 'text-right'}>
                                                            <p className="text-xs opacity-80 font-medium">
                                                                {purchaseConfig.invoiceInfo.labels?.invoiceNumber || "Bill No."}
                                                            </p>
                                                            <p className="text-xl font-black text-white">#PUR-2026-001</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "supplier" && purchaseConfig.supplier.showName) {
                                                return (
                                                    <div 
                                                        key="supplier" 
                                                        className="mb-5 p-4 border"
                                                        style={{ 
                                                            backgroundColor: purchaseConfig.design.secondaryColor || '#fffbeb',
                                                            borderColor: purchaseConfig.design.borderColor || '#cbd5e1',
                                                            borderRadius: `${purchaseConfig.design.cornerRadius}px`
                                                        }}
                                                    >
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: purchaseConfig.design.primaryColor }}>Supplier (Vendor Details)</h4>
                                                        <p className="font-extrabold text-sm text-slate-950">Apex Wholesale Distributors Private Limited</p>
                                                        {purchaseConfig.supplier.showAddress && <p className="text-xs text-slate-600">Plot 45, Industrial Estate, Guindy, Chennai - 600032</p>}
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                                                            {purchaseConfig.supplier.showPhone && <span>Ph: +91 94433 22110</span>}
                                                            {purchaseConfig.supplier.showEmail && <span>Email: billing@apexwholesale.com</span>}
                                                            {purchaseConfig.supplier.showGSTIN && <span className="font-semibold text-slate-800">GSTIN: 33APEXD9182B1Z4</span>}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "customer" && purchaseConfig.customer.showName) {
                                                return (
                                                    <div key="customer" className="mb-5 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">Bill To (Customer / Receiving Branch)</h4>
                                                        <p className="font-bold text-xs text-slate-900">SHREE ANDAL TRADERS - Central Warehouse</p>
                                                        {purchaseConfig.customer.showBillingAddress && <p className="text-xs text-slate-600">Main Bazaar Road, Madurai, TN 625001</p>}
                                                        <div className="flex flex-wrap gap-x-4 text-xs text-slate-600 mt-1">
                                                            {purchaseConfig.customer.showPhone && <span>Ph: +91 98765 43210</span>}
                                                            {purchaseConfig.customer.showGSTIN && <span className="font-semibold">GSTIN: 33ANDAL8271A1Z5</span>}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "invoiceInfo") {
                                                const info = purchaseConfig.invoiceInfo;
                                                return (
                                                    <div key="invoiceInfo" className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                                                        {info.showInvoiceNumber && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceNumber || "Bill No."}</span>
                                                                <span className="font-bold text-slate-900">PUR-2026-001</span>
                                                            </div>
                                                        )}
                                                        {info.showInvoiceDate && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceDate || "Bill Date"}</span>
                                                                <span className="font-semibold text-slate-800">12 Sep 2026</span>
                                                            </div>
                                                        )}
                                                        {info.showDueDate && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.dueDate || "Due Date"}</span>
                                                                <span className="font-semibold text-slate-800">27 Sep 2026</span>
                                                            </div>
                                                        )}
                                                        {info.showPaymentTerms && (
                                                            <div>
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.paymentTerms || "Terms"}</span>
                                                                <span className="font-semibold text-slate-800">Net 15 Days</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "items") {
                                                const borderCls = purchaseConfig.design.borderStyle === "none" ? "border-none" : purchaseConfig.design.borderStyle === "medium" ? "border-2 border-slate-300" : "border border-slate-200";
                                                
                                                return (
                                                    <div key="items" className="mb-6 overflow-hidden" style={{ borderRadius: `${purchaseConfig.design.cornerRadius}px` }}>
                                                        <table className={`w-full text-left border-collapse ${borderCls}`}>
                                                            <thead>
                                                                <tr className="text-white text-xs font-bold" style={{ backgroundColor: purchaseConfig.design.primaryColor }}>
                                                                    <th className="py-2.5 px-3">#</th>
                                                                    {purchaseConfig.items.columns.map((col) => (
                                                                        <th key={col} className="py-2.5 px-3">
                                                                            {(purchaseConfig.items.labels as any)[col] || col}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 text-xs">
                                                                <tr>
                                                                    <td className="py-3 px-3">1</td>
                                                                    {purchaseConfig.items.columns.map((col) => {
                                                                        if (col === "item") return <td key={col} className="py-3 px-3 font-bold text-slate-950">Premium Rice Bag 25kg</td>;
                                                                        if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500">Aromatic Superfine Grade</td>;
                                                                        if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600 font-mono text-[11px]">RICE-25KG-01</td>;
                                                                        if (col === "hsn") return <td key={col} className="py-3 px-3 text-slate-600">10063010</td>;
                                                                        if (col === "quantity") return <td key={col} className="py-3 px-3">10 Bags</td>;
                                                                        if (col === "rate") return <td key={col} className="py-3 px-3">₹1,400.00</td>;
                                                                        if (col === "tax") return <td key={col} className="py-3 px-3">5% GST</td>;
                                                                        if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹14,700.00</td>;
                                                                        return <td key={col}>-</td>;
                                                                    })}
                                                                </tr>
                                                                <tr style={{ backgroundColor: purchaseConfig.design.secondaryColor || '#fffbeb' }}>
                                                                    <td className="py-3 px-3">2</td>
                                                                    {purchaseConfig.items.columns.map((col) => {
                                                                        if (col === "item") return <td key={col} className="py-3 px-3 font-bold text-slate-950">Refined Sunflower Oil 1L</td>;
                                                                        if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500">Fortified Cooking Oil</td>;
                                                                        if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600 font-mono text-[11px]">OIL-1L-05</td>;
                                                                        if (col === "hsn") return <td key={col} className="py-3 px-3 text-slate-600">15121910</td>;
                                                                        if (col === "quantity") return <td key={col} className="py-3 px-3">24 Cartons</td>;
                                                                        if (col === "rate") return <td key={col} className="py-3 px-3">₹120.00</td>;
                                                                        if (col === "tax") return <td key={col} className="py-3 px-3">5% GST</td>;
                                                                        if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹3,024.00</td>;
                                                                        return <td key={col}>-</td>;
                                                                    })}
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "tax") {
                                                const taxCfg = purchaseConfig.tax;
                                                return (
                                                    <div key="tax" className="mb-6 flex justify-end">
                                                        <div className="w-72 space-y-1.5 text-xs">
                                                            {taxCfg.showTaxableAmount && <div className="flex justify-between text-slate-600"><span>Taxable Amount</span><span>₹16,880.00</span></div>}
                                                            {taxCfg.showCGST && <div className="flex justify-between text-slate-500 text-[11px]"><span>CGST (2.5%)</span><span>₹422.00</span></div>}
                                                            {taxCfg.showSGST && <div className="flex justify-between text-slate-500 text-[11px]"><span>SGST (2.5%)</span><span>₹422.00</span></div>}
                                                            {taxCfg.showTotalTax && <div className="flex justify-between text-slate-600 font-medium border-t border-slate-100 pt-1"><span>Total Tax</span><span>₹844.00</span></div>}
                                                            <div 
                                                                className="flex justify-between items-center py-2.5 px-3.5 text-white font-bold rounded-lg mt-2 shadow-sm"
                                                                style={{ 
                                                                    backgroundColor: purchaseConfig.design.primaryColor,
                                                                    borderRadius: `${purchaseConfig.design.cornerRadius}px`
                                                                }}
                                                            >
                                                                <span>Grand Total Amount</span>
                                                                <span className="text-base font-black">₹17,724.00</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "payment" && (purchaseConfig.payment.showPaidAmount || purchaseConfig.payment.showBalance)) {
                                                return (
                                                    <div key="payment" className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                                                        {purchaseConfig.payment.showPaidAmount && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Amount Paid</span><span className="font-bold text-emerald-800 text-sm">₹10,000.00</span></div>}
                                                        {purchaseConfig.payment.showBalance && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Balance Due</span><span className="font-bold text-rose-700 text-sm">₹7,724.00</span></div>}
                                                        {purchaseConfig.payment.showPaymentMethod && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Payment Mode</span><span className="font-semibold text-slate-800">Bank Wire / NEFT</span></div>}
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "notes" && purchaseConfig.notes.show) {
                                                return (
                                                    <div key="notes" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{purchaseConfig.notes.label || "Purchase Notes"}</p>
                                                        <p className="text-slate-600">{purchaseConfig.notes.defaultText}</p>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "terms" && purchaseConfig.terms.show) {
                                                return (
                                                    <div key="terms" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{purchaseConfig.terms.label || "Terms & Conditions"}</p>
                                                        <p className="text-slate-500">{purchaseConfig.terms.defaultText}</p>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "signature" && purchaseConfig.signature.show) {
                                                return (
                                                    <div key="signature" className="mt-8 flex justify-end">
                                                        <div className="text-center w-52">
                                                            {purchaseConfig.signature.imageUrl ? (
                                                                <img src={purchaseConfig.signature.imageUrl} alt="Signature" className="h-12 w-auto mx-auto object-contain mb-1" />
                                                            ) : (
                                                                <div className="h-10 border-b border-slate-400 mb-1"></div>
                                                            )}
                                                            <p className="font-extrabold text-xs text-slate-900">{purchaseConfig.signature.name || "Inventory Manager"}</p>
                                                            <p className="text-[10px] text-slate-500">{purchaseConfig.signature.designation || "Authorized Stock Receiver"}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (sectionName === "footer" && purchaseConfig.footer.show) {
                                                return (
                                                    <div key="footer" className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                        {purchaseConfig.footer.text}
                                                    </div>
                                                );
                                            }

                                            return null;
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Template Cards List View */
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Sliders className="h-4 w-4 text-amber-400" />
                                        <span className="text-xs font-bold text-slate-300">Filter Templates:</span>
                                    </div>
                                    <div className="flex gap-2">
                                        {(["all", "active", "inactive"] as const).map((flt) => (
                                            <button
                                                key={flt}
                                                type="button"
                                                onClick={() => setTemplateStatusFilter(flt)}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                                                    templateStatusFilter === flt
                                                        ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                                                        : "bg-white/5 border border-slate-800 text-slate-400 hover:bg-white/10 hover:text-white"
                                                }`}
                                            >
                                                {flt}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {userTemplates.length === 0 ? (
                                        <div className="col-span-3 py-16 text-center bg-white/5 rounded-3xl border border-slate-800">
                                            <Sliders className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                                            <h3 className="text-base font-bold text-white">No Purchase Templates Found</h3>
                                            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">Get started by creating a customized purchase bill layout for your vendor invoices.</p>
                                            <Button onClick={handleOpenNewPurchaseTemplate} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl">
                                                Create First Template
                                            </Button>
                                        </div>
                                    ) : (
                                        userTemplates
                                            .filter(t => {
                                                const matchName = t.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) || (t.description || "").toLowerCase().includes(templateSearchTerm.toLowerCase());
                                                const matchStatus = templateStatusFilter === "all" || t.status === templateStatusFilter;
                                                return matchName && matchStatus;
                                            })
                                            .map((t) => {
                                                const cfg = t.config || {};
                                                const primaryColor = cfg.design?.primaryColor || "#d97706";
                                                const fontFamily = cfg.design?.fontFamily || "Inter";
                                                return (
                                                    <Card key={t._id} className="group overflow-hidden rounded-[24px] border border-slate-800 bg-slate-900 flex flex-col justify-between hover:border-amber-500/50 transition-all duration-300">
                                                        <div>
                                                            {/* Mock Thumbnail Preview */}
                                                            <div className="h-40 w-full relative flex items-center justify-center border-b border-slate-800 select-none overflow-hidden" style={{ backgroundColor: `${primaryColor}15` }}>
                                                                <div className="w-3/4 h-5/6 bg-white border border-slate-300 rounded-t-lg p-3 flex flex-col justify-between mt-3 shadow-md">
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="h-3 w-10 rounded" style={{ backgroundColor: primaryColor }}></div>
                                                                        <div className="h-2 w-12 bg-slate-200 rounded"></div>
                                                                    </div>
                                                                    <div className="space-y-1 my-2">
                                                                        <div className="h-1.5 w-full bg-slate-100 rounded"></div>
                                                                        <div className="h-1.5 w-4/6 bg-slate-100 rounded"></div>
                                                                    </div>
                                                                    <div className="border-t border-slate-100 pt-1 flex justify-between items-center">
                                                                        <div className="h-2 w-8 bg-slate-200 rounded"></div>
                                                                        <div className="h-2.5 w-10 rounded" style={{ backgroundColor: primaryColor }}></div>
                                                                    </div>
                                                                </div>

                                                                <div className="absolute top-3 left-3 flex gap-1.5">
                                                                    {t.isDefault && (
                                                                        <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                                                            <Star className="h-3 w-3 fill-slate-950 stroke-slate-950" />
                                                                            DEFAULT
                                                                        </span>
                                                                    )}
                                                                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm ${
                                                                        t.status === "active"
                                                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                                                            : "bg-slate-800 text-slate-400"
                                                                    }`}>
                                                                        {(t.status || "active").toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Meta Info */}
                                                            <div className="p-4 space-y-2">
                                                                <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">{t.name}</h3>
                                                                <p className="text-xs text-slate-400 line-clamp-2 h-8">{t.description || "Custom purchase invoice design layout."}</p>
                                                                <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                                                                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(t.createdAt).toLocaleDateString()}</span>
                                                                    <span>Font: <span className="font-semibold text-slate-200">{fontFamily}</span></span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Actions Panel */}
                                                        <div className="p-3 border-t border-slate-800 bg-slate-950/60 grid grid-cols-4 gap-1.5">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditPurchaseTemplate(t)} className="rounded-xl h-8 bg-white/5 text-slate-200 border-slate-800 hover:bg-white/10" title="Edit Design Studio">
                                                                <Edit3 className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="outline" size="sm" onClick={() => handleDuplicatePurchaseTemplate(t._id)} className="rounded-xl h-8 bg-white/5 text-slate-200 border-slate-800 hover:bg-white/10" title="Duplicate Template">
                                                                <Copy className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="outline" size="sm" disabled={t.isDefault} onClick={() => handleSetDefaultPurchaseTemplate(t._id)} className={`rounded-xl h-8 border-slate-800 ${t.isDefault ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-white/5 text-slate-200 hover:bg-white/10"}`} title={t.isDefault ? "Default Template" : "Set as Default"}>
                                                                <Star className={`h-3.5 w-3.5 ${t.isDefault ? "fill-amber-400 stroke-amber-400" : ""}`} />
                                                            </Button>
                                                            <Button variant="outline" size="sm" disabled={t.isDefault} onClick={() => handleDeletePurchaseTemplate(t._id)} className="rounded-xl h-8 bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20" title="Delete Template">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </Card>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </main>

            <div className="mt-8 text-center">
                <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40 bg-white/30">
                    Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
                </p>
            </div>
        </div>
    );
};

export default Inventory;
