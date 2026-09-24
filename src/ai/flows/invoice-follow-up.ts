'use server';

/**
 * @fileOverview Invoice follow-up flow to generate personalized customer messages.
 *
 * - invoiceFollowUp - A function that generates a follow-up message for an invoice.
 * - InvoiceFollowUpInput - The input type for the invoiceFollowUp function.
 * - InvoiceFollowUpOutput - The return type for the invoiceFollowUp function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InvoiceFollowUpInputSchema = z.object({
  customerName: z
    .string()
    .describe('The name of the customer the invoice is for.'),
  invoiceNumber: z.string().describe('The invoice number.'),
  invoiceTotal: z.number().describe('The total amount of the invoice.'),
  dueDate: z.string().describe('The due date of the invoice (YYYY-MM-DD).'),
  shopName: z.string().describe('The name of the automobile shop.'),
});
export type InvoiceFollowUpInput = z.infer<typeof InvoiceFollowUpInputSchema>;

const InvoiceFollowUpOutputSchema = z.object({
  followUpMessage: z
    .string()
    .describe('A personalized follow-up message for the customer.'),
});
export type InvoiceFollowUpOutput = z.infer<typeof InvoiceFollowUpOutputSchema>;

export async function invoiceFollowUp(input: InvoiceFollowUpInput): Promise<InvoiceFollowUpOutput> {
  return invoiceFollowUpFlow(input);
}

const prompt = ai.definePrompt({
  name: 'invoiceFollowUpPrompt',
  input: {schema: InvoiceFollowUpInputSchema},
  output: {schema: InvoiceFollowUpOutputSchema},
  prompt: `You are an expert assistant for a small automobile shop.

  Generate a personalized follow-up message to send to the customer, politely reminding them about the invoice.
  Make sure to include the invoice number, total amount, and due date. Be friendly and professional.

  Customer Name: {{{customerName}}}
  Invoice Number: {{{invoiceNumber}}}
  Invoice Total: {{{invoiceTotal}}}
  Due Date: {{{dueDate}}}
  Shop Name: {{{shopName}}}
  `,
});

const invoiceFollowUpFlow = ai.defineFlow(
  {
    name: 'invoiceFollowUpFlow',
    inputSchema: InvoiceFollowUpInputSchema,
    outputSchema: InvoiceFollowUpOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
