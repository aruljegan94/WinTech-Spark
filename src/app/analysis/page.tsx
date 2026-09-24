'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Sale, AnalysisData, ProductSaleInfo } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChartBig, TrendingDown, TrendingUp, CircleDollarSign, Package, Sparkles, AlertTriangle } from 'lucide-react';
import { analyzeSales } from '@/ai/flows/analyze-sales';
import Markdown from 'react-markdown';

export default function AnalysisPage() {
  const firestore = useFirestore();

  // Data fetching
  const salesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'sales') : null), [firestore]);
  const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesQuery);

  const productsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'products') : null), [firestore]);
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const isLoading = salesLoading || productsLoading;

  const analysisData: AnalysisData | null = useMemo(() => {
    if (isLoading || !sales || !products) return null;

    const productSalesMap = new Map<string, { quantitySold: number; totalRevenue: number; totalProfit: number; }>();

    // Initialize map
    products.forEach(p => {
      productSalesMap.set(p.id, { quantitySold: 0, totalRevenue: 0, totalProfit: 0 });
    });

    // Aggregate sales data
    sales.forEach(sale => {
      sale.items.forEach(item => {
        if (productSalesMap.has(item.productId)) {
          const product = products.find(p => p.id === item.productId);
          if (!product) return;

          const existing = productSalesMap.get(item.productId)!;
          existing.quantitySold += item.quantity;
          existing.totalRevenue += item.total;
          const profitPerItem = item.price - product.purchasePrice;
          existing.totalProfit += profitPerItem * item.quantity;
          productSalesMap.set(item.productId, existing);
        }
      });
    });

    const allProductInfo: ProductSaleInfo[] = Array.from(productSalesMap.entries()).map(([productId, data]) => {
      const product = products.find(p => p.id === productId)!;
      return {
        productId,
        productName: product.productName,
        ...data,
      };
    });

    const soldProducts = allProductInfo.filter(p => p.quantitySold > 0);

    const topSellingProducts = [...soldProducts].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5);
    const mostProfitableProducts = [...soldProducts].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5);
    
    const leastSellingProducts = [...soldProducts].sort((a, b) => a.quantitySold - b.quantitySold).slice(0, 5);
    const zeroSalesProducts = products.filter(p => (productSalesMap.get(p.id)?.quantitySold ?? 0) === 0)
        .map(p => ({ id: p.id, productName: p.productName, stockQuantity: p.stockQuantity }));


    return { topSellingProducts, leastSellingProducts, zeroSalesProducts, mostProfitableProducts };
  }, [sales, products, isLoading]);
  
  
  const handleGenerateReport = async () => {
    if (!sales || !products) return;
    setIsGeneratingReport(true);
    setGenerationError(null);
    setAiReport(null);
    try {
      const result = await analyzeSales({ sales, products });
      setAiReport(result.report);
    } catch (e: any) {
      setGenerationError(e.message || "An unknown error occurred while generating the report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };


  const renderSkeleton = () => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );

  if (isLoading) {
    return <>{renderSkeleton()}</>;
  }

  return (
    <>
      <PageHeader
        title="Sales & Stock Analysis"
        description="Get insights into your product performance and customer trends."
      />
      <div className="grid gap-4 md:gap-8 mt-4">
        
        {/* Key Insight Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Selling Product</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analysisData?.topSellingProducts[0]?.productName || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">
                {analysisData?.topSellingProducts[0]?.quantitySold || 0} units sold
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Most Profitable Product</CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analysisData?.mostProfitableProducts[0]?.productName || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">
                ₹{analysisData?.mostProfitableProducts[0]?.totalProfit.toLocaleString() || 0} total profit
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dead Stock Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analysisData?.zeroSalesProducts.length || 0}</div>
              <p className="text-xs text-muted-foreground">Products with zero sales</p>
            </CardContent>
          </Card>
        </div>

         {/* AI Business Report Card */}
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            AI Business Report
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Click the button to generate an AI-powered summary of your business performance.
                        </CardDescription>
                    </div>
                    <Button onClick={handleGenerateReport} disabled={isGeneratingReport} className="mt-4 sm:mt-0">
                        {isGeneratingReport ? 'Generating...' : 'Generate Report'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isGeneratingReport && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <BarChartBig className="h-5 w-5 animate-pulse" />
                        <span>Analyzing your data... this may take a moment.</span>
                    </div>
                )}
                {generationError && (
                    <div className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span>{generationError}</span>
                    </div>
                )}
                {aiReport && (
                     <div className="prose dark:prose-invert max-w-none">
                        <Markdown>{aiReport}</Markdown>
                    </div>
                )}
            </CardContent>
        </Card>


        {/* Detailed Tables */}
        <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
              <CardDescription>
                Your best-selling products by quantity sold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisData?.topSellingProducts.map(p => (
                    <TableRow key={p.productId}>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-right">{p.quantitySold}</TableCell>
                      <TableCell className="text-right">₹{p.totalRevenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Low Performing Products</CardTitle>
              <CardDescription>
                Products with little or no sales. Consider promotions or discontinuing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Stock Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisData?.zeroSalesProducts.slice(0, 3).map(p => (
                    <TableRow key={p.id} className="bg-red-50 dark:bg-red-900/20">
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-right">0</TableCell>
                       <TableCell className="text-right">{p.stockQuantity}</TableCell>
                    </TableRow>
                  ))}
                  {analysisData?.leastSellingProducts.map(p => (
                     <TableRow key={p.productId}>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-right">{p.quantitySold}</TableCell>
                      <TableCell className="text-right">
                          {products?.find(prod => prod.id === p.productId)?.stockQuantity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
