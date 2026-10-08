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
  system: `You are an expert OCR AI invoice parser for an automobile parts business.
Analyze the provided purchase invoice image/document carefully.
Extract all relevant fields into structured JSON matching the output schema:
1. Supplier / Vendor Name
2. Invoice / Bill Number
3. Invoice Date (convert to YYYY-MM-DD format if possible)
4. Line Items: Extract each product item with its Product Name, Quantity, Unit Purchase Price, GST Percentage, and Line Item Total with GST.
5. Grand Total Amount.

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
