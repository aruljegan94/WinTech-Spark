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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Sale, Customer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChartBig, TrendingDown, TrendingUp, CircleDollarSign, Package, Sparkles,
  AlertTriangle, Users, UserCheck, Crown, ShieldAlert, ArrowRight, Search,
  RefreshCw, CheckCircle2, IndianRupee, Layers, ExternalLink, Zap, Clock
} from 'lucide-react';
import { analyzeSales } from '@/ai/flows/analyze-sales';
import Markdown from 'react-markdown';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';

export default function AnalysisPage() {
  const firestore = useFirestore();

  // Data fetching
  const salesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'sales') : null), [firestore]);
  const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesQuery);

  const productsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'products') : null), [firestore]);
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  const customersQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'customers') : null), [firestore]);
  const { data: customers, isLoading: customersLoading } = useCollection<Customer>(customersQuery);

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  const isLoading = salesLoading || productsLoading || customersLoading;

  // 1. Product & Sales Intelligence Calculations
  const productMetrics = useMemo(() => {
    if (!products || !sales) return null;

    const productMap = new Map<string, {
      product: Product;
      unitsSold: number;
      revenue: number;
      profit: number;
      profitMargin: number;
    }>();

    products.forEach((p) => {
      productMap.set(p.id, {
        product: p,
        unitsSold: 0,
        revenue: 0,
        profit: 0,
        profitMargin: 0,
      });
    });

    let totalGrossRevenue = 0;
    let totalGrossProfit = 0;

    sales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        const purchasePrice = prod ? Number(prod.purchasePrice) || 0 : 0;
        const itemPrice = Number(item.price) || 0;
        const itemQty = Number(item.quantity) || 1;
        const itemRevenue = Number(item.total) || itemPrice * itemQty;
        const itemProfit = (itemPrice - purchasePrice) * itemQty;

        totalGrossRevenue += itemRevenue;
        totalGrossProfit += itemProfit;

        if (productMap.has(item.productId)) {
          const entry = productMap.get(item.productId)!;
          entry.unitsSold += itemQty;
          entry.revenue += itemRevenue;
          entry.profit += itemProfit;
        }
      });
    });

    // Calculate profit margins per product
    productMap.forEach((entry) => {
      if (entry.revenue > 0) {
        entry.profitMargin = (entry.profit / entry.revenue) * 100;
      }
    });

    const allProductList = Array.from(productMap.values());
    const soldProducts = allProductList.filter((p) => p.unitsSold > 0);

    const topRevenueProducts = [...soldProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    const topProfitProducts = [...soldProducts].sort((a, b) => b.profit - a.profit).slice(0, 6);
    const slowMovingProducts = soldProducts.filter((p) => p.unitsSold > 0 && p.unitsSold <= 2);

    // Dead stock: zero units sold
    const deadStockProducts = allProductList
      .filter((p) => p.unitsSold === 0 && (p.product.stockQuantity || 0) > 0)
      .map((p) => ({
        product: p.product,
        trappedCost: (p.product.stockQuantity || 0) * (p.product.purchasePrice || 0),
      }));

    const totalDeadStockTrappedValue = deadStockProducts.reduce((sum, p) => sum + p.trappedCost, 0);

    // Fast-mover stockout risk: top products with low remaining stock
    const stockoutRiskProducts = soldProducts
      .filter((p) => (p.product.stockQuantity || 0) <= 3 && p.unitsSold >= 3)
      .map((p) => p.product);

    const overallMargin = totalGrossRevenue > 0 ? (totalGrossProfit / totalGrossRevenue) * 100 : 0;

    return {
      totalGrossRevenue,
      totalGrossProfit,
      overallMargin,
      topRevenueProducts,
      topProfitProducts,
      slowMovingProducts,
      deadStockProducts,
      totalDeadStockTrappedValue,
      stockoutRiskProducts,
    };
  }, [products, sales]);

  // 2. Customer Analytics Calculations
  const customerMetrics = useMemo(() => {
    if (!customers || !sales) return null;

    // Map sales by customer (matching by customerId or matching mobile)
    const customerSalesMap = new Map<string, {
      totalSpent: number;
      orderCount: number;
      lastPurchaseDate: Date | null;
    }>();

    // Initialize map
    customers.forEach((c) => {
      customerSalesMap.set(c.id, {
        totalSpent: 0,
        orderCount: 0,
        lastPurchaseDate: null,
      });
    });

    sales.forEach((s) => {
      let matchedCustId = s.customerId;
      if (!matchedCustId && s.customerMobile) {
        const found = customers.find((c) => c.mobile && c.mobile === s.customerMobile);
        if (found) matchedCustId = found.id;
      }

      if (matchedCustId && customerSalesMap.has(matchedCustId)) {
        const stats = customerSalesMap.get(matchedCustId)!;
        stats.totalSpent += Number(s.total) || 0;
        stats.orderCount += 1;
        const sDate = new Date(s.date);
        if (!isNaN(sDate.getTime())) {
          if (!stats.lastPurchaseDate || sDate > stats.lastPurchaseDate) {
            stats.lastPurchaseDate = sDate;
          }
        }
      }
    });

    // Aggregate enriched customer data
    const enrichedCustomers = customers.map((c) => {
      const stats = customerSalesMap.get(c.id);
      const totalSpent = stats?.totalSpent && stats.totalSpent > 0 ? stats.totalSpent : (c.totalSpent || 0);
      const totalOrders = stats?.orderCount && stats.orderCount > 0 ? stats.orderCount : (c.totalInvoices || 0);
      const lastPurchase = stats?.lastPurchaseDate || (c.updatedAt ? new Date(c.updatedAt) : null);
      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      return {
        ...c,
        calculatedSpent: totalSpent,
        calculatedOrders: totalOrders,
        avgOrderValue,
        lastPurchase,
      };
    });

    const totalCustomersCount = enrichedCustomers.length;
    const repeatCustomers = enrichedCustomers.filter((c) => c.calculatedOrders >= 2);
    const repeatRate = totalCustomersCount > 0 ? (repeatCustomers.length / totalCustomersCount) * 100 : 0;

    const totalSalesCount = sales.length;
    const overallRevenue = productMetrics?.totalGrossRevenue || 0;
    const averageOrderValue = totalSalesCount > 0 ? overallRevenue / totalSalesCount : 0;

    const totalCustomerCreditDues = enrichedCustomers.reduce((acc, c) => acc + (Number(c.pendingDue) || 0), 0);

    // Segmentation
    const sortedBySpend = [...enrichedCustomers].sort((a, b) => b.calculatedSpent - a.calculatedSpent);
    const vipThreshold = averageOrderValue * 2;
    const vipChampions = sortedBySpend.filter((c) => c.calculatedSpent >= vipThreshold || c.calculatedOrders >= 3);
    const loyalRegulars = enrichedCustomers.filter((c) => c.calculatedOrders >= 2 && !vipChampions.includes(c));
    
    // Inactive / At risk: registered customers with no purchase in last 45 days or zero orders
    const now = new Date();
    const atRiskCustomers = enrichedCustomers.filter((c) => {
      if (c.calculatedOrders === 0) return true;
      if (c.lastPurchase) {
        return differenceInDays(now, c.lastPurchase) >= 45;
      }
      return false;
    });

    const creditRiskCustomers = enrichedCustomers.filter((c) => (c.pendingDue || 0) > 0);

    return {
      totalCustomersCount,
      repeatCustomersCount: repeatCustomers.length,
      repeatRate,
      averageOrderValue,
      totalCustomerCreditDues,
      enrichedCustomers: sortedBySpend,
      vipChampions,
      loyalRegulars,
      atRiskCustomers,
      creditRiskCustomers,
    };
  }, [customers, sales, productMetrics]);

  // Filtered customer leaderboard
  const filteredCustomers = useMemo(() => {
    if (!customerMetrics) return [];
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customerMetrics.enrichedCustomers;
    return customerMetrics.enrichedCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customerMetrics, customerSearch]);

  const handleGenerateReport = async () => {
    if (!sales || !products) return;
    setIsGeneratingReport(true);
    setGenerationError(null);
    setAiReport(null);
    try {
      const result = await analyzeSales({
        sales,
        products,
        customers: customerMetrics?.enrichedCustomers || [],
      });
      setAiReport(result.report);
    } catch (e: any) {
      setGenerationError(e.message || 'An error occurred while generating the business growth report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const renderSkeleton = () => (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );

  if (isLoading) {
    return <>{renderSkeleton()}</>;
  }

  return (
    <>
      <PageHeader
        title="Business & Growth Intelligence"
        description="Actionable sales diagnosis, customer analytics, and AI growth strategies to expand profits."
      >
        <Button
          size="sm"
          onClick={handleGenerateReport}
          disabled={isGeneratingReport}
          className="gap-2 bg-gradient-to-r from-primary via-indigo-600 to-primary text-white shadow-xs"
        >
          {isGeneratingReport ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing Business...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Generate AI Growth Plan</span>
            </>
          )}
        </Button>
      </PageHeader>

      {/* Top Executive KPI Ribbon */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-3">
        {/* Gross Revenue */}
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Cumulative Sales Revenue</CardTitle>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              ₹{productMetrics?.totalGrossRevenue.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Across {(sales || []).length} completed invoices
            </p>
          </CardContent>
        </Card>

        {/* Gross Profit & Margin */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Gross Profit & Margin</CardTitle>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                ₹{productMetrics?.totalGrossProfit.toLocaleString() || 0}
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                {productMetrics?.overallMargin.toFixed(1)}% Margin
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Net realized markup value</p>
          </CardContent>
        </Card>

        {/* Repeat Customer Rate */}
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Customer Repeat Rate</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <UserCheck className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {customerMetrics?.repeatRate.toFixed(1)}%
              </div>
              <span className="text-xs text-muted-foreground">
                {customerMetrics?.repeatCustomersCount} / {customerMetrics?.totalCustomersCount} returning
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Avg Order Value: <strong>₹{Math.round(customerMetrics?.averageOrderValue || 0).toLocaleString()}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Dead Stock Trapped Capital */}
        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Dead Stock Trapped Cash</CardTitle>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
              <Package className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
              ₹{productMetrics?.totalDeadStockTrappedValue.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {productMetrics?.deadStockProducts.length || 0} items with 0 sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs defaultValue="growth" className="space-y-3">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="growth" className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>AI Growth Advisor</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span>Customer Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Product Intelligence</span>
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 1: AI GROWTH ADVISOR
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="growth" className="space-y-3">
          {/* Smart Pre-computed Immediate Action Cards */}
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {/* Action 1: Liquidation */}
            <Card className="border-l-4 border-l-rose-500 shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30 font-semibold">
                    Quick Win
                  </Badge>
                  <Package className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <CardTitle className="text-xs font-semibold mt-1">Unlock Dead Stock Cash</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 text-xs text-muted-foreground">
                You have <strong className="text-foreground">₹{productMetrics?.totalDeadStockTrappedValue.toLocaleString()}</strong> trapped in {productMetrics?.deadStockProducts.length} unsold products. Offer a 20% discount bundle with your top seller to recover cash this week.
              </CardContent>
            </Card>

            {/* Action 2: VIP Customer Retention */}
            <Card className="border-l-4 border-l-amber-500 shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 font-semibold">
                    High Impact
                  </Badge>
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <CardTitle className="text-xs font-semibold mt-1">Nurture Top VIP Buyers</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 text-xs text-muted-foreground">
                <strong className="text-foreground">{customerMetrics?.vipChampions.length} VIP customers</strong> generate the bulk of your sales. Send personalized WhatsApp thank-you messages with priority service to lock in loyalty.
              </CardContent>
            </Card>

            {/* Action 3: Basket Size Expansion */}
            <Card className="border-l-4 border-l-emerald-500 shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold">
                    AOV Booster
                  </Badge>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <CardTitle className="text-xs font-semibold mt-1">Cross-Sell Small Add-ons</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 text-xs text-muted-foreground">
                Current Average Basket is <strong className="text-foreground">₹{Math.round(customerMetrics?.averageOrderValue || 0).toLocaleString()}</strong>. Recommending a routine lubricant or spare bulb during checkout can lift revenue by 18%.
              </CardContent>
            </Card>

            {/* Action 4: Fast Mover Stockout Warning */}
            <Card className="border-l-4 border-l-indigo-500 shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/30 font-semibold">
                    Restock Alert
                  </Badge>
                  <Zap className="h-3.5 w-3.5 text-indigo-500" />
                </div>
                <CardTitle className="text-xs font-semibold mt-1">Prevent Stockout Losses</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 text-xs text-muted-foreground">
                {(productMetrics?.stockoutRiskProducts.length || 0) > 0 ? (
                  <>
                    <strong className="text-foreground">{productMetrics?.stockoutRiskProducts.length} fast-moving products</strong> are critically low in inventory (&le; 3 units). Place purchase orders to prevent lost sales.
                  </>
                ) : (
                  <>All top-selling inventory has adequate stock levels. Good inventory buffer maintained.</>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Comprehensive Business Report */}
          <Card className="border-primary/20 shadow-xs">
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Executive Business Growth Report
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Synthesizes sales, product profit margins, and customer behavior into an actionable scaling playbook.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  className="gap-2 shrink-0 bg-primary"
                >
                  {isGeneratingReport ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Generating Strategy...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{aiReport ? 'Regenerate Analysis' : 'Run Growth Analysis'}</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {isGeneratingReport && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="p-3 rounded-full bg-primary/10 text-primary animate-pulse">
                    <BarChartBig className="h-8 w-8 animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Synthesizing Business Intelligence...</h4>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1">
                      Our AI model is calculating profit margins, customer cohorts, dead-stock capital, and strategic growth opportunities.
                    </p>
                  </div>
                </div>
              )}

              {generationError && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{generationError}</span>
                </div>
              )}

              {!isGeneratingReport && !aiReport && !generationError && (
                <div className="py-10 text-center space-y-3">
                  <div className="p-3 rounded-full bg-muted w-12 h-12 flex items-center justify-center mx-auto text-muted-foreground">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="max-w-md mx-auto">
                    <h4 className="text-sm font-semibold">Generate Your Tailored Growth Playbook</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click the button above to have our AI analyze your transactions, customer cohorts, and inventory costs to generate a step-by-step strategy for increasing shop revenue and margins.
                    </p>
                  </div>
                </div>
              )}

              {!isGeneratingReport && aiReport && (
                <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed">
                  <Markdown>{aiReport}</Markdown>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 2: CUSTOMER ANALYTICS (DEEP DIVE)
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-3">
          {/* Customer KPI Cards */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Total Customer Base</CardTitle>
                <Users className="h-3.5 w-3.5 text-indigo-500" />
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold">{customerMetrics?.totalCustomersCount || 0}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Registered contact profiles</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Repeat Customer Rate</CardTitle>
                <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {customerMetrics?.repeatRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {customerMetrics?.repeatCustomersCount} customers bought 2+ times
                </p>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Average Order Value (AOV)</CardTitle>
                <CircleDollarSign className="h-3.5 w-3.5 text-cyan-500" />
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold">
                  ₹{Math.round(customerMetrics?.averageOrderValue || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Average checkout ticket size</p>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Customer Credit Dues</CardTitle>
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  ₹{customerMetrics?.totalCustomerCreditDues.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {customerMetrics?.creditRiskCustomers.length || 0} accounts with pending credit
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Customer Cohort Segmentation Cards */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5" /> VIP Champions
                </span>
                <Badge variant="outline" className="text-[10px] bg-amber-500/20 border-amber-500/30">
                  {customerMetrics?.vipChampions.length} clients
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Highest lifetime value clients. Driving significant store revenue.
              </p>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Loyal Regulars
                </span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/20 border-emerald-500/30">
                  {customerMetrics?.loyalRegulars.length} clients
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Consistent repeat buyers. Excellent candidates for cross-sell bundles.
              </p>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> At-Risk / Inactive
                </span>
                <Badge variant="outline" className="text-[10px] bg-rose-500/20 border-rose-500/30">
                  {customerMetrics?.atRiskCustomers.length} clients
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Haven&apos;t visited in over 45 days. Run a WhatsApp re-engagement campaign.
              </p>
            </div>

            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5" /> Pending Credit
                </span>
                <Badge variant="outline" className="text-[10px] bg-indigo-500/20 border-indigo-500/30">
                  {customerMetrics?.creditRiskCustomers.length} clients
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Outstanding balances due for recovery to protect store cash flow.
              </p>
            </div>
          </div>

          {/* Customer Leaderboard Table */}
          <Card>
            <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold tracking-tight">Customer Value Leaderboard</CardTitle>
                  <CardDescription className="text-xs">
                    Ranked by lifetime procurement volume and engagement history.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link href="/customers" className="flex items-center gap-1">
                    Manage Customers <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>

              <div className="relative min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search customer by name or phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-8 pr-7 h-8 text-xs bg-background"
                />
                {customerSearch && (
                  <button
                    onClick={() => setCustomerSearch('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    type="button"
                  >
                    ×
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead className="min-w-[160px]">Customer Name</TableHead>
                    <TableHead className="w-[120px]">Phone</TableHead>
                    <TableHead className="w-[90px] text-center">Invoices</TableHead>
                    <TableHead className="w-[120px] text-right">Lifetime Spend</TableHead>
                    <TableHead className="w-[110px] text-right">Avg Ticket</TableHead>
                    <TableHead className="w-[110px] text-right">Credit Due</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                        No customer profiles found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((cust, idx) => {
                      const isVIP = (customerMetrics?.vipChampions || []).some((v) => v.id === cust.id);
                      return (
                        <TableRow key={cust.id}>
                          <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                            #{idx + 1}
                          </TableCell>

                          <TableCell>
                            <div className="font-semibold text-xs flex items-center gap-1.5">
                              {cust.name}
                              {isVIP && (
                                <span title="VIP Champion">
                                  <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />
                                </span>
                              )}
                            </div>
                            {cust.address && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                {cust.address}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {cust.mobile || '—'}
                          </TableCell>

                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                              {cust.calculatedOrders} order{cust.calculatedOrders === 1 ? '' : 's'}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right font-semibold text-xs whitespace-nowrap text-foreground">
                            ₹{cust.calculatedSpent.toLocaleString()}
                          </TableCell>

                          <TableCell className="text-right text-xs text-muted-foreground">
                            ₹{Math.round(cust.avgOrderValue).toLocaleString()}
                          </TableCell>

                          <TableCell className="text-right text-xs font-medium">
                            {(cust.pendingDue || 0) > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                ₹{(cust.pendingDue || 0).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">₹0</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            {isVIP ? (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                VIP
                              </Badge>
                            ) : cust.calculatedOrders >= 2 ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                Repeat
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Single
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 3: PRODUCT & INVENTORY INTELLIGENCE
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="products" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Top Revenue Generators */}
            <Card>
              <CardHeader className="p-3 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Top Revenue Drivers
                </CardTitle>
                <CardDescription className="text-xs">
                  Products bringing the highest gross cash into the business.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-[80px] text-right">Units</TableHead>
                      <TableHead className="w-[110px] text-right">Revenue</TableHead>
                      <TableHead className="w-[100px] text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(productMetrics?.topRevenueProducts || []).map((p) => (
                      <TableRow key={p.product.id}>
                        <TableCell className="font-medium text-xs">
                          {p.product.productName}
                          <div className="text-[10px] text-muted-foreground">{p.product.category}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs">{p.unitsSold}</TableCell>
                        <TableCell className="text-right font-semibold text-xs whitespace-nowrap">
                          ₹{p.revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-emerald-600 font-semibold whitespace-nowrap">
                          ₹{p.profit.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Most Profitable Products */}
            <Card>
              <CardHeader className="p-3 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <CircleDollarSign className="h-4 w-4 text-emerald-600" />
                  Margin Champions (Highest Profit)
                </CardTitle>
                <CardDescription className="text-xs">
                  Products generating the largest net profit after purchase costs.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-[90px] text-right">Gross Profit</TableHead>
                      <TableHead className="w-[80px] text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(productMetrics?.topProfitProducts || []).map((p) => (
                      <TableRow key={p.product.id}>
                        <TableCell className="font-medium text-xs">
                          {p.product.productName}
                          <div className="text-[10px] text-muted-foreground">
                            ₹{p.product.purchasePrice} cost &rarr; ₹{p.product.sellingPrice} sell
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-emerald-600 font-bold whitespace-nowrap">
                          ₹{p.profit.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            {p.profitMargin.toFixed(0)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Dead Stock Liquidation Table */}
          <Card className="border-rose-500/20">
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <Package className="h-4 w-4" />
                  Dead Stock Liquidation Priorities
                </CardTitle>
                <CardDescription className="text-xs">
                  Products with zero sales holding trapped working capital. Liquidate to recover cash flow.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-xs font-bold">
                ₹{productMetrics?.totalDeadStockTrappedValue.toLocaleString()} Trapped
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product Name</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[90px] text-center">Unsold Units</TableHead>
                    <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
                    <TableHead className="w-[130px] text-right font-semibold">Trapped Cash</TableHead>
                    <TableHead className="w-[140px] text-center">Liquidation Strategy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(productMetrics?.deadStockProducts || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                        🎉 Great job! No dead stock items detected with zero sales.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (productMetrics?.deadStockProducts || []).map(({ product, trappedCost }) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium text-xs">
                          {product.productName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.category || 'General'}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold">
                          {product.stockQuantity || 0}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          ₹{product.purchasePrice.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          ₹{trappedCost.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 font-normal">
                            Bundle / 20% Off
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
