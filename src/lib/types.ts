import { z } from 'zod';

export type Product = {
  id: string;
  productName: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  gstPercentage: number;
  barcode?: string;
  markupPercentage?: number;
};

export type Vendor = {
  id: string;
  name: string;
  companyName: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNo?: string;
  pendingAmount: number;
  notes?: string;
  createdAt?: string;
  totalPurchases?: number;
  totalInvoices?: number;
};

export type PurchaseItem = {
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
  totalAmount: number;
};

export type Purchase = {
  id: string;
  supplierName: string;
  vendorId?: string;
  invoiceNo: string;
  date: string; // ISO string
  items: PurchaseItem[];
  totalAmount: number;
  paymentStatus: 'Paid' | 'Partial' | 'Pending';
  amountPaid: number;
  dueDate?: string; // ISO or YYYY-MM-DD string
  paymentNotes?: string;
};

export type PurchaseOrderItem = {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string; // Nos, Pcs, Ltr, Box, Kg, Mtr, Set, Pkt, Can, Pair, etc.
  estimatedPrice: number; // Unit price
  estimatedTotal: number; // quantity * estimatedPrice
  notes?: string;
};

export type PurchaseOrder = {
  id: string;
  orderNumber: string; // e.g. PO-2026-001
  vendorId?: string;
  vendorName: string;
  vendorPhone?: string;
  vendorGst?: string;
  vendorAddress?: string;
  date: string; // ISO string
  expectedDeliveryDate?: string; // YYYY-MM-DD
  items: PurchaseOrderItem[];
  totalQuantity: number;
  totalEstimatedAmount: number;
  status: 'Draft' | 'Sent' | 'Received' | 'Cancelled';
  notes?: string;
  createdAt: string; // ISO string
  updatedAt?: string;
};

export type Customer = {
  id: string;
  name: string; // Mandatory
  mobile: string;
  address?: string;
  email?: string;
  pendingDue: number; // Outstanding / credit balance to be collected
  totalSpent: number; // Lifetime total sales value
  totalInvoices: number; // Count of invoices
  offers?: string; // Active discount or promotional offer notes
  notes?: string;
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
};

export type SaleItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  gstPercentage: number;
  total: number;
};

export type Sale = {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId?: string;
  customerName?: string;
  customerMobile?: string;
  customerAddress?: string;
  customerGstNo?: string;
  items: SaleItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
  paymentStatus: 'Paid' | 'Partial' | 'Pending';
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  amountPaid?: number;
  status: 'Paid' | 'Pending' | 'Partial';
  dueDate?: string;
  notes?: string;
  placeOfSupply?: string;
};


export type Expense = {
  id: string;
  date: string; // Should be ISO string
  expenseType: string;
  amount: number;
  notes?: string;
};

export type User = {
  id: string; // This will be the Firebase Auth UID
  name: string;
  email: string;
  phoneNumber?: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  // No avatar needed as we will use email for fallback
};

export type CompanyProfile = {
  id: string;
  companyName: string;
  ownedBy: string;
  address: string;
  contact: string;
  gstNumber: string;
  isDefault?: boolean;
  invoicePrefix?: string;
  invoiceSuffix?: string;
  email?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBranch?: string;
  upiId?: string;
  termsAndConditions?: string;
  state?: string;
  stateCode?: string;
};

export type NotificationType =
  | 'overdue_invoice'
  | 'low_stock'
  | 'monthly_summary'
  | 'info'
  | 'payment_to_pay'
  | 'payment_to_receive'
  | 'birthday'
  | 'gst_reminder';

export type Notification = {
  id: string;
  type: NotificationType;
  message: string;
  referenceId?: string; // e.g., purchaseId, saleId, employeeId, vendorId
  isRead: boolean;
  createdAt: string; // ISO string
  dueDate?: string;
  category?: 'payment_due' | 'receivable' | 'birthday' | 'gst' | 'stock';
};

export type Employee = {
  id: string;
  name: string;
  designation: string;
  phone: string;
  email?: string;
  dateOfBirth?: string; // ISO string (YYYY-MM-DD)
  dateOfJoining?: string; // ISO string (YYYY-MM-DD)
  salary?: number;
  notes?: string;
};

export type AppSettings = {
  id: string;
  lowStockAlerts: boolean;
  overdueInvoiceAlerts: boolean;
  birthdayReminders: boolean;
  lowStockThreshold: number;
};



// Zod schema for the input of the generateNotifications flow
export const GenerateNotificationsInputSchema = z.object({
  sales: z.array(z.object({
    id: z.string(),
    invoiceNumber: z.string(),
    total: z.number(),
    paymentStatus: z.enum(['Paid', 'Partial', 'Pending']),
  })),
  products: z.array(z.object({
    id: z.string(),
    productName: z.string(),
    stockQuantity: z.number(),
  })),
});
export type GenerateNotificationsInput = z.infer<typeof GenerateNotificationsInputSchema>;


// Zod schema for the output of the generateNotifications flow
const NotificationOutputSchema = z.object({
  type: z.enum(['overdue_invoice', 'low_stock', 'monthly_summary', 'info']),
  message: z.string(),
  referenceId: z.string().optional(),
});

export const GenerateNotificationsOutputSchema = z.object({
  notifications: z.array(NotificationOutputSchema),
});
export type GenerateNotificationsOutput = z.infer<typeof GenerateNotificationsOutputSchema>;

// Types for Sales Analysis
export type ProductSaleInfo = {
  productId: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
  totalProfit: number;
};

export type AnalysisData = {
  topSellingProducts: ProductSaleInfo[];
  leastSellingProducts: ProductSaleInfo[];
  zeroSalesProducts: { id: string, productName: string, stockQuantity: number }[];
  mostProfitableProducts: ProductSaleInfo[];
};

export const AnalyzeSalesInputSchema = z.object({
    sales: z.array(z.any()), // Using any for simplicity; replace with Sale schema if available
    products: z.array(z.any()), // Using any for simplicity; replace with Product schema if available
    customers: z.array(z.any()).optional(),
});
export type AnalyzeSalesInput = z.infer<typeof AnalyzeSalesInputSchema>;


export const AnalyzeSalesOutputSchema = z.object({
  report: z.string().describe('A detailed, narrative report summarizing the sales and stock analysis. Provide actionable insights.'),
});
export type AnalyzeSalesOutput = z.infer<typeof AnalyzeSalesOutputSchema>;
