'use server';
/**
 * @fileOverview Flow to generate an invoice image.
 *
 * - generateInvoiceImage - A function that takes structured invoice data and returns an image.
 * - GenerateInvoiceImageInput - The input type for the function.
 * - GenerateInvoiceImageOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const InvoiceItemSchema = z.object({
    productName: z.string().describe('The name of the product or service.'),
    quantity: z.number().describe('The quantity of the item.'),
    price: z.number().describe('The price per unit of the item.'),
    total: z.number().describe('The total price for this line item (quantity * price).'),
});

export const GenerateInvoiceImageInputSchema = z.object({
  companyName: z.string().describe("The name of the company issuing the invoice."),
  companyAddress: z.string().describe("The physical address of the company."),
  companyGst: z.string().describe("The GSTIN of the company."),
  customerName: z.string().describe("The name of the customer."),
  customerMobile: z.string().optional().describe("The mobile number of the customer."),
  invoiceNumber: z.string().describe("The unique identifier for the invoice."),
  invoiceDate: z.string().describe("The date the invoice was issued (e.g., 'July 28, 2024')."),
  dueDate: z.string().describe("The date the payment is due (e.g., 'August 12, 2024')."),
  items: z.array(InvoiceItemSchema).describe("An array of items included in the invoice."),
  subtotal: z.number().describe("The total cost before taxes."),
  gstAmount: z.number().describe("The total amount of GST."),
  total: z.number().describe("The final, total amount due."),
  paymentStatus: z.string().describe("The current payment status (e.g., 'Paid', 'Pending', 'Partial')."),
});
export type GenerateInvoiceImageInput = z.infer<typeof GenerateInvoiceImageInputSchema>;


export const GenerateInvoiceImageOutputSchema = z.object({
  imageUrl: z.string().describe("A data URI of the generated invoice image. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type GenerateInvoiceImageOutput = z.infer<typeof GenerateInvoiceImageOutputSchema>;

export async function generateInvoiceImage(input: GenerateInvoiceImageInput): Promise<GenerateInvoiceImageOutput> {
    return generateInvoiceImageFlow(input);
}

const prompt = ai.definePrompt({
    name: 'generateInvoiceImagePrompt',
    input: { schema: GenerateInvoiceImageInputSchema },
    system: `You are an expert graphic designer who creates clean, professional, and easy-to-read invoices as images.

    Your task is to take the provided JSON data and generate a visually appealing PNG image of an invoice.

    - The design should be modern and clean. Use a clear, legible font.
    - The layout should be well-structured.
    - The company's name should be prominent at the top.
    - Clearly separate sections for company details, customer details, invoice metadata, items table, and totals.
    - The items should be in a table with clear headings (Product, Qty, Price, Total).
    - The final totals (Subtotal, GST, Total) should be right-aligned and easy to find at the bottom.
    - The payment status should be clearly visible.

    Do not include any extra text, commentary, or markdown formatting around the image. The output must be ONLY the generated image.
    `,
    prompt: `
    Generate an invoice image with the following details:
    
    Company: {{companyName}}
    Address: {{companyAddress}}
    GSTIN: {{companyGst}}
    
    Bill To: {{customerName}} ({{customerMobile}})
    
    Invoice #: {{invoiceNumber}}
    Date: {{invoiceDate}}
    Due: {{dueDate}}
    
    Items:
    {{#each items}}
    - {{this.productName}} (Qty: {{this.quantity}}, Price: ₹{{this.price}}, Total: ₹{{this.total}})
    {{/each}}
    
    Subtotal: ₹{{subtotal}}
    GST: ₹{{gstAmount}}
    Total: ₹{{total}}
    Status: {{paymentStatus}}
    `,
    output: {
        format: 'media'
    }
});


const generateInvoiceImageFlow = ai.defineFlow(
  {
    name: 'generateInvoiceImageFlow',
    inputSchema: GenerateInvoiceImageInputSchema,
    outputSchema: GenerateInvoiceImageOutputSchema,
  },
  async (input) => {
    const { media, usage } = await ai.generate({
        model: 'googleai/gemini-3.1-flash-image',
        prompt: await prompt.render(input),
        config: {
            responseModalities: ['IMAGE'],
        }
    });
    
    if (!media || !media.url) {
        throw new Error('Image generation failed to return a data URL.');
    }

    return { imageUrl: media.url };
  }
);
