'use server';

/**
 * @fileOverview AI Flow to parse purchase invoice images/PDFs using Gemini Vision OCR.
 * This file only exports async functions to comply with Next.js 'use server' rules.
 */

import { ai } from '@/ai/genkit';
import {
  ParsePurchaseInvoiceInputSchema,
  ParsePurchaseInvoiceOutputSchema,
  type ParsePurchaseInvoiceInput,
  type ParsePurchaseInvoiceOutput,
} from './parse-purchase-invoice-types';

const prompt = ai.definePrompt({
  name: 'parsePurchaseInvoicePrompt',
  input: { schema: ParsePurchaseInvoiceInputSchema },
  output: { schema: ParsePurchaseInvoiceOutputSchema },
  system: `You are an expert OCR AI invoice parser for an automobile parts and retail business.
Analyze the provided purchase invoice image/document carefully.
Extract all relevant fields into structured JSON matching the output schema:
1. Supplier / Vendor Name
2. Invoice / Bill Number
3. Invoice Date (convert to YYYY-MM-DD format if possible)
4. GST Tax Mode: Set isGstIncluded to true if the unit prices printed on invoice already include GST/taxes (e.g. retail cash memos, invoices with 'Incl. of all taxes', or where line total equals Qty * Rate), or false if GST is calculated separately and added on top of unit rates.
5. Line Items: Extract each product item with:
   - Product Name (description of the part/product)
   - Part Number / Item Code / SKU / Barcode: Look for columns like 'Part No', 'Part Number', 'Item Code', 'Article No', 'SKU', or 'Barcode'. Extract this into partNumber.
   - Quantity: Number of units purchased
   - Unit Purchase Price: Rate or unit price as printed on the invoice
   - GST Percentage: Tax rate (e.g. 28, 18, 12, 5, 0)
   - Line Item Total with GST: Total amount for this item including GST
   - MRP (Maximum Retail Price): If printed on invoice (often in a dedicated 'MRP' column), extract it into mrp (to be used as selling price).
6. Grand Total Amount.

If any field is missing or unreadable, provide a best-effort estimate or sensible default (e.g. GST % default to 18 if unspecified, Date default to today's date).`,
  prompt: `Please parse this purchase invoice document:\n{{media url=imageDataUrl}}`,
});

const parsePurchaseInvoiceFlow = ai.defineFlow(
  {
    name: 'parsePurchaseInvoiceFlow',
    inputSchema: ParsePurchaseInvoiceInputSchema,
    outputSchema: ParsePurchaseInvoiceOutputSchema,
  },
  async (input) => {
    try {
      // Fast and highly available gemini-3.5-flash with fallback to gemini-3.8-flash
      const candidateModels = ['googleai/gemini-3.5-flash', 'googleai/gemini-3.8-flash'];
      let output: ParsePurchaseInvoiceOutput | null = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          const res = await prompt(input, { model });
          if (res?.output) {
            output = res.output;
            break;
          }
        } catch (err: any) {
          console.warn(`[parsePurchaseInvoice] Model ${model} error, attempting fallback:`, err?.message || err);
          lastError = err;
          if (
            err?.message?.includes('leaked') ||
            err?.message?.includes('403') ||
            err?.message?.includes('API key not valid')
          ) {
            throw err;
          }
        }
      }

      if (!output) {
        throw lastError || new Error('Failed to parse purchase invoice document.');
      }
      return output;
    } catch (err: any) {
      if (
        err?.message?.includes('leaked') ||
        err?.message?.includes('403') ||
        err?.message?.includes('API key')
      ) {
        throw new Error(
          'Gemini API key was revoked by Google ([403 Forbidden] API key reported as leaked). Please update GEMINI_API_KEY in .env.local with a new key from Google AI Studio.'
        );
      }
      throw err;
    }
  }
);

export async function parsePurchaseInvoice(
  input: ParsePurchaseInvoiceInput
): Promise<ParsePurchaseInvoiceOutput> {
  return parsePurchaseInvoiceFlow(input);
}
