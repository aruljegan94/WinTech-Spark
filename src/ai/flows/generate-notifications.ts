'use server';
/**
 * @fileOverview A flow to analyze business data and generate notifications.
 *
 * - generateNotifications - Analyzes sales and products to create alerts.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { GenerateNotificationsInput, GenerateNotificationsOutput } from '@/lib/types';


export async function generateNotifications(input: GenerateNotificationsInput): Promise<GenerateNotificationsOutput> {
  return generateNotificationsFlow(input);
}

const NotificationSchema = z.object({
  type: z.enum(['overdue_invoice', 'low_stock', 'monthly_summary', 'info']),
  message: z.string().describe('A concise and clear notification message for the user.'),
  referenceId: z.string().optional().describe('The ID of the related document (e.g., sale ID, product ID).'),
});

const flowOutputSchema = z.object({
    notifications: z.array(NotificationSchema).describe('An array of generated notifications.')
});


const prompt = ai.definePrompt({
  name: 'generateNotificationsPrompt',
  input: { schema: z.any() },
  output: { schema: flowOutputSchema },
  system: `You are an expert business assistant for a small automobile shop.
Your task is to analyze JSON data containing sales, products, and a monthly summary.
Based on this data, you must generate a list of actionable notifications for the shop owner.

Prioritize the most critical information.

1.  **Overdue Invoices**: Identify any sales with a status of 'Pending' or 'Partial'. Create a notification for each one. The message should clearly state the invoice number and the amount due.
2.  **Low Stock Alerts**: Identify any products where the stock quantity is 10 or less. Create a notification for each low-stock product. The message should state the product name and the remaining quantity.
3.  **Monthly Summary**: If a monthly summary is provided, create a single, concise notification that summarizes the key metrics: total sales, net profit, and new customers.
4.  **No Issues**: If there are no overdue invoices, no low stock items, and no monthly summary, generate a single 'info' notification with a friendly message stating that everything looks good.

Generate a JSON object containing a 'notifications' array.`,
  prompt: `
    Analyze the following business data and generate notifications.

    **Current Date**: ${new Date().toLocaleDateString()}

    **Sales Data**:
    \`\`\`json
    {{{json sales}}}
    \`\`\`

    **Product Data**:
    \`\`\`json
    {{{json products}}}
    \`\`\`
    `,
});

const generateNotificationsFlow = ai.defineFlow(
  {
    name: 'generateNotificationsFlow',
    inputSchema: z.custom<GenerateNotificationsInput>(),
    outputSchema: z.custom<GenerateNotificationsOutput>(),
  },
  async (data) => {

    const overdueSales = data.sales.filter(s => s.paymentStatus === 'Pending' || s.paymentStatus === 'Partial');
    const lowStockProducts = data.products.filter(p => p.stockQuantity <= 10);
    
    try {
        const { output } = await prompt({ sales: overdueSales, products: lowStockProducts });

        if (!output) {
            return { notifications: [] };
        }
        
        return output;
    } catch (e: any) {
        if (e.message?.includes('503')) {
            throw new Error('The AI model is currently overloaded. Please try again in a moment.');
        }
        throw e; // Re-throw other errors
    }
  }
);
