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
  quantity: z.number().describe('Quantity of items purchased'),
  purchasePrice: z.number().describe('Unit price per item (before GST)'),
  gstPercentage: z.number().describe('GST percentage rate (e.g. 18, 28, 12, 5, 0)'),
  amountWithGst: z.number().describe('Total amount for this line item including GST'),
});

export const ParsePurchaseInvoiceOutputSchema = z.object({
  supplierName: z.string().describe('Extracted supplier / vendor company name'),
  invoiceNo: z.string().describe('Extracted invoice or bill number'),
  date: z.string().describe('Invoice date in YYYY-MM-DD format'),
  items: z.array(PurchaseInvoiceItemSchema).describe('List of line items'),
  totalAmount: z.number().describe('Grand total amount of the invoice'),
});

export type ParsePurchaseInvoiceInput = z.infer<typeof ParsePurchaseInvoiceInputSchema>;
export type ParsePurchaseInvoiceOutput = z.infer<typeof ParsePurchaseInvoiceOutputSchema>;
