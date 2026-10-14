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

function sanitizeError(err: any): Error {
  const rawMsg = err?.message || String(err || 'Unknown error');
  // Strip out any query param containing key=AIza... or any api key
  let sanitized = rawMsg
    .replace(/([?&]key=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED]')
    .replace(/AIza[a-zA-Z0-9_\-]{35}/g, '[REDACTED_API_KEY]');

  if (
    sanitized.includes('403') ||
    sanitized.includes('leaked') ||
    sanitized.includes('API key not valid') ||
    sanitized.includes('PERMISSION_DENIED')
  ) {
    return new Error(
      'Gemini API key is invalid or unauthorized. Please verify GEMINI_API_KEY in your environment configuration.'
    );
  }
  if (
    sanitized.includes('503') ||
    sanitized.includes('high demand') ||
    sanitized.includes('Service Unavailable')
  ) {
    return new Error(
      'AI service is currently busy due to temporary high demand. Please try scanning again in a few moments, or enter item details manually.'
    );
  }
  if (
    sanitized.includes('429') ||
    sanitized.includes('quota') ||
    sanitized.includes('RESOURCE_EXHAUSTED')
  ) {
    return new Error(
      'Gemini API quota reached. Please wait a moment before trying again.'
    );
  }

  // Generic sanitized error without sensitive request URLs or keys
  const cleanSummary = sanitized.split('\n')[0].slice(0, 250);
  return new Error(cleanSummary || 'Failed to scan and parse purchase invoice.');
}

const parsePurchaseInvoiceFlow = ai.defineFlow(
  {
    name: 'parsePurchaseInvoiceFlow',
    inputSchema: ParsePurchaseInvoiceInputSchema,
    outputSchema: ParsePurchaseInvoiceOutputSchema,
  },
  async (input) => {
    // Fast and highly available model cascade
    const candidateModels = [
      'googleai/gemini-flash-latest',
      'googleai/gemini-2.5-flash-lite',
      'googleai/gemini-3.5-flash-lite',
      'googleai/gemini-3.5-flash',
      'googleai/gemini-3.7-flash',
      'googleai/gemini-3.8-flash',
    ];
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
        lastError = err;
        const msg = String(err?.message || '');
        if (
          msg.includes('403') ||
          msg.includes('leaked') ||
          msg.includes('API key not valid')
        ) {
          break;
        }
        // Brief pause before trying next fallback model
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!output) {
      throw sanitizeError(lastError || new Error('Failed to parse purchase invoice document.'));
    }

    return output;
  }
);

export async function parsePurchaseInvoice(
  input: ParsePurchaseInvoiceInput
): Promise<ParsePurchaseInvoiceOutput> {
  return parsePurchaseInvoiceFlow(input);
}
