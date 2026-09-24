'use server';
/**
 * @fileOverview A flow to analyze business data (sales, products) and generate a report.
 *
 * - analyzeSales - Analyzes sales and products to create a business intelligence report.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { AnalyzeSalesInput, AnalyzeSalesOutput, AnalyzeSalesInputSchema, AnalyzeSalesOutputSchema } from '@/lib/types';


export async function analyzeSales(input: AnalyzeSalesInput): Promise<AnalyzeSalesOutput> {
  return analyzeSalesFlow(input);
}


const prompt = ai.definePrompt({
  name: 'analyzeSalesPrompt',
  input: { schema: AnalyzeSalesInputSchema },
  output: { schema: AnalyzeSalesOutputSchema },
  system: `You are an expert business analyst for a small automobile shop.
Your task is to analyze JSON data containing all sales and all products.
Based on this data, you must generate a comprehensive business intelligence report with actionable insights for the shop owner.

The report should be well-structured, easy to read, and provide clear takeaways. Use markdown for formatting.

Structure your report as follows:

### 📈 Business Performance Summary
- Start with a high-level overview. Mention total revenue and total profit from the provided sales data.
- Highlight the best-selling product by revenue.
- Highlight the most profitable product overall.

### 🚀 Top Performing Products
- List the top 3-5 products based on the highest **sales revenue**.
- For each, mention the revenue generated and the number of units sold.

### 🐢 Slow-Moving Products
- List products that have sold only 1 or 2 units.
- Suggest potential actions, like offering a discount or bundling them with popular items.

### 🚫 Zero-Sales Products (Dead Stock)
- List all products that have **zero** sales. This is critical information.
- Strongly advise the owner to consider liquidating this stock to free up capital and space. Mention the total value of this dead stock (quantity * purchasePrice).

### 💰 Profitability Insights
- List the top 3-5 most **profitable** products (profit per item * quantity sold).
- Explain why focusing on these products is important for the business's health.

###  actionable Recommendations
- Conclude with a short, bulleted list of 3-4 clear, actionable recommendations for the shop owner based on your analysis. For example: "Restock more of [Product X]", "Create a promotion for [Product Y]", "Stop ordering [Product Z]".

Analyze the following business data to generate the report.
`,
  prompt: `
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

const analyzeSalesFlow = ai.defineFlow(
  {
    name: 'analyzeSalesFlow',
    inputSchema: z.custom<AnalyzeSalesInput>(),
    outputSchema: z.custom<AnalyzeSalesOutput>(),
  },
  async (data) => {
    
    // Simple pre-processing to enrich sales data for the model
    const processedSales = data.sales.map(sale => {
        const itemsWithProfit = sale.items.map((item: any) => {
            const product = data.products.find((p: any) => p.id === item.productId);
            const purchasePrice = product ? product.purchasePrice : 0;
            const profit = (item.price - purchasePrice) * item.quantity;
            return {
                ...item,
                purchasePrice,
                profit
            };
        });
        const totalProfit = itemsWithProfit.reduce((sum: number, item: any) => sum + item.profit, 0);
        return {
            ...sale,
            items: itemsWithProfit,
            totalProfit
        };
    });

    try {
        const { output } = await prompt({ sales: processedSales, products: data.products });

        if (!output) {
            return { report: 'Analysis could not be generated.' };
        }
        
        return output;
    } catch (e: any) {
        if (e.message?.includes('503')) {
            throw new Error('The AI model is currently overloaded. Please try again in a moment.');
        }
        console.error("Error in analyzeSalesFlow: ", e);
        throw new Error('An unexpected error occurred during analysis.');
    }
  }
);
