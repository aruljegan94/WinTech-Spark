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
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('Failed to parse purchase invoice document.');
    }
    return output;
  }
);

export async function parsePurchaseInvoice(
  input: ParsePurchaseInvoiceInput
): Promise<ParsePurchaseInvoiceOutput> {
  return parsePurchaseInvoiceFlow(input);
}
