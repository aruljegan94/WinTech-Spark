'use server';
/**
 * @fileOverview A flow to analyze business data (sales, products, customers) and generate a comprehensive growth strategy.
 *
 * - analyzeSales - Analyzes sales, products, and customer trends to create an actionable business growth intelligence report.
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
  system: `You are a world-class retail business growth consultant and financial analyst specializing in automotive spare parts, workshops, and retail inventory businesses.

Your goal is NOT to write generic observations. Your goal is to give the business owner a HIGH-IMPACT, REALISTIC, DATA-BACKED GROWTH PLAYBOOK with exact numbers, prioritized recommendations, and clear steps to grow revenue, expand profit margins, and maximize customer retention.

Structure your report into the following clean, executive sections using clear GitHub-flavored markdown:

---
### 📈 1. Executive Performance & Financial Health
- **Revenue & Gross Profit Health**: Analyze total revenue, total gross profit, and overall profit margin percentage. Compare high-performing categories against weaker ones.
- **Top Revenue Driver**: Which product generated the highest gross revenue and why.
- **Top Margin Champion**: Which product yielded the highest absolute gross profit.

---
### 👥 2. Customer Analytics & Retention Intelligence
- **Customer Base Health**: Evaluate the customer repeat purchase rate, Average Order Value (AOV), and customer spend distribution.
- **VIP Customer Value**: Highlight top-tier spending customers and suggest a VIP retention/perk strategy to ensure they never defect to competitors.
- **At-Risk & Inactive Customers**: Provide a concrete win-back strategy (SMS/WhatsApp offer, seasonal service checkup) for customers who haven't returned recently.
- **Credit & Dues Recovery**: If there are outstanding customer balances (pending credit), advise on credit control and structured follow-up policies without damaging customer goodwill.

---
### 🚀 3. Revenue Acceleration & Basket-Size Expansion
- **Cross-Selling & Bundling**: Propose 2-3 specific product bundles (e.g., pairing fast-moving tubes or spare parts with maintenance services or consumables like lubricants) to increase Average Order Value (AOV) by 15-25%.
- **Price Optimization**: Identify products where a 5% to 10% price markup would meet low price sensitivity and drop straight to the bottom-line profit.

---
### 📦 4. Inventory Capital & Dead Stock Liquidation Plan
- **Dead Stock Trapped Capital**: Explicitly calculate the total capital trapped in zero-sale inventory (Stock Quantity × Purchase Price).
- **Liquidation Playbook**: Give 3 distinct, creative methods to liquidate slow-moving/dead inventory within the next 30 days (e.g., clearance discount, free gift with high-value purchases, service package add-on).
- **Fast-Mover Stockout Warning**: Warn about top-selling items with low remaining inventory to avoid lost revenue from stockouts.

---
### 🎯 5. The 7-Day & 30-Day Growth Roadmap
Give a crisp, prioritized table or checklist of exact actions:
| Timeline | Priority | Strategic Action | Target Outcome |
| :--- | :--- | :--- | :--- |
| Next 7 Days | Quick Win | ... | ... |
| Next 14 Days | High Impact | ... | ... |
| Next 30 Days | Strategic | ... | ... |

Make every insight sharp, practical, and grounded in the numbers provided.
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

    {{#if customers}}
    **Customer Data**:
    \`\`\`json
    {{{json customers}}}
    \`\`\`
    {{/if}}
  `,
});

const analyzeSalesFlow = ai.defineFlow(
  {
    name: 'analyzeSalesFlow',
    inputSchema: z.custom<AnalyzeSalesInput>(),
    outputSchema: z.custom<AnalyzeSalesOutput>(),
  },
  async (data) => {
    // Enrich sales data with profit calculations
    const processedSales = (data.sales || []).map((sale: any) => {
      const itemsWithProfit = (sale.items || []).map((item: any) => {
        const product = (data.products || []).find((p: any) => p.id === item.productId);
        const purchasePrice = product ? Number(product.purchasePrice) || 0 : 0;
        const profit = ((Number(item.price) || 0) - purchasePrice) * (Number(item.quantity) || 1);
        return {
          ...item,
          purchasePrice,
          profit,
        };
      });
      const totalProfit = itemsWithProfit.reduce((sum: number, item: any) => sum + item.profit, 0);
      return {
        ...sale,
        items: itemsWithProfit,
        totalProfit,
      };
    });

    try {
      const { output } = await prompt({
        sales: processedSales,
        products: data.products || [],
        customers: data.customers || [],
      });

      if (!output) {
        return { report: 'Analysis could not be generated at this time.' };
      }

      return output;
    } catch (e: any) {
      if (e.message?.includes('503')) {
        throw new Error('The AI model is currently busy. Please retry in a few seconds.');
      }
      console.error('Error in analyzeSalesFlow:', e);
      throw new Error(e.message || 'An unexpected error occurred during business analysis.');
    }
  }
);
