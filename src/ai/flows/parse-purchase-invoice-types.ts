/**
 * @fileOverview Shared Zod schemas and TypeScript types for the Purchase Invoice OCR flow.
 * This file is NOT a server action — it only exports schemas and types.
 */

import { z } from 'zod';

export const ParsePurchaseInvoiceInputSchema = z.object({
  imageDataUrl: z.string().describe(
    'Data URL of the uploaded purchase invoice (e.g. data:image/png;base64,... or data:application/pdf;base64,...)'
  ),
});

export const PurchaseInvoiceItemSchema = z.object({
  productName: z.string().describe('Name or description of the product/part'),
  partNumber: z.string().optional().describe('Part Number, SKU, Item Code, Catalog/Article number, or Barcode if present on the invoice'),
  quantity: z.number().describe('Quantity of items purchased'),
  purchasePrice: z.number().describe('Unit price per item as printed on the invoice'),
  gstPercentage: z.number().describe('GST percentage rate (e.g. 18, 28, 12, 5, 0)'),
  amountWithGst: z.number().describe('Total amount for this line item including GST'),
  mrp: z.number().optional().describe('MRP (Maximum Retail Price) per unit if present on the invoice'),
});

export const ParsePurchaseInvoiceOutputSchema = z.object({
  supplierName: z.string().describe('Extracted supplier / vendor company name'),
  invoiceNo: z.string().describe('Extracted invoice or bill number'),
  date: z.string().describe('Invoice date in YYYY-MM-DD format'),
  isGstIncluded: z.boolean().optional().describe('True if unit prices printed on invoice already include GST (tax-inclusive), false if GST is calculated on top of rates'),
  items: z.array(PurchaseInvoiceItemSchema).describe('List of line items'),
  totalAmount: z.number().describe('Grand total amount of the invoice'),
});

export type ParsePurchaseInvoiceInput = z.infer<typeof ParsePurchaseInvoiceInputSchema>;
export type ParsePurchaseInvoiceOutput = z.infer<typeof ParsePurchaseInvoiceOutputSchema>;
