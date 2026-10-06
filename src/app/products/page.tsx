'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MoreHorizontal,
  PlusCircle,
  Search,
  ArrowUpDown,
  RotateCcw,
  X,
  Boxes,
  AlertTriangle,
  PackageX,
  IndianRupee,
  Barcode,
  Pencil,
  Trash2,
  Tag,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductsPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Filter & Sort States
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: rawProducts, isLoading } = useCollection<Product>(productsQuery);

  // Extract unique categories
  const categories = useMemo(() => {
    if (!rawProducts) return [];
    const set = new Set<string>();
    rawProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [rawProducts]);

  // Key KPI stats
  const { totalItems, lowStockCount, outOfStockCount, totalStockValue } = useMemo(() => {
    if (!rawProducts) return { totalItems: 0, lowStockCount: 0, outOfStockCount: 0, totalStockValue: 0 };
    let low = 0;
    let out = 0;
    let value = 0;
    rawProducts.forEach((p) => {
      if (p.stockQuantity <= 0) out++;
      else if (p.stockQuantity < 10) low++;
      value += (p.purchasePrice || 0) * (p.stockQuantity || 0);
    });
    return {
      totalItems: rawProducts.length,
      lowStockCount: low,
      outOfStockCount: out,
      totalStockValue: value,
    };
  }, [rawProducts]);

  // Filtered & Sorted products
  const products = useMemo(() => {
    if (!rawProducts) return [];

    let list = rawProducts.filter((product) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        product.productName.toLowerCase().includes(q) ||
        product.category?.toLowerCase().includes(q) ||
        product.barcode?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (categoryFilter !== 'all' && product.category !== categoryFilter) {
        return false;
      }

      if (stockFilter === 'in_stock' && product.stockQuantity <= 0) {
        return false;
      }
      if (stockFilter === 'low_stock' && (product.stockQuantity <= 0 || product.stockQuantity >= 10)) {
        return false;
      }
      if (stockFilter === 'out_of_stock' && product.stockQuantity > 0) {
        return false;
      }

      return true;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.productName.localeCompare(b.productName);
        case 'name-desc':
          return b.productName.localeCompare(a.productName);
        case 'price-asc':
          return a.sellingPrice - b.sellingPrice;
        case 'price-desc':
          return b.sellingPrice - a.sellingPrice;
        case 'stock-asc':
          return a.stockQuantity - b.stockQuantity;
        case 'stock-desc':
          return b.stockQuantity - a.stockQuantity;
        case 'category-asc':
          return (a.category || '').localeCompare(b.category || '');
        default:
          return 0;
      }
    });

    return list;
  }, [rawProducts, searchTerm, sortBy, categoryFilter, stockFilter]);

  const hasActiveFilters =
    searchTerm !== '' || sortBy !== 'name-asc' || categoryFilter !== 'all' || stockFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setSortBy('name-asc');
    setCategoryFilter('all');
    setStockFilter('all');
  };

  const handleDeleteProduct = () => {
    if (!firestore || !productToDelete) return;

    const productRef = doc(firestore, 'products', productToDelete.id);
    deleteDocumentNonBlocking(productRef);

    toast({
      title: 'Product Deleted',
      description: `${productToDelete.productName} has been successfully deleted.`,
    });
    setProductToDelete(null);
  };

  // WhatsApp Purchase Reorder List Generator
  const handleWhatsAppReorderList = () => {
    if (!rawProducts) return;
    const needed = rawProducts.filter((p) => p.stockQuantity < 10);
    if (needed.length === 0) {
      toast({ title: 'Stock Healthy', description: 'All items have 10+ units in stock.' });
      return;
    }

    const dateStr = format(new Date(), 'dd-MMM-yyyy');
    let text = `📦 *PURCHASE REORDER LIST*\n`;
    text += `Date: ${dateStr}\n`;
    text += `Store: WinTech-Spark Catalog\n\n`;
    text += `Please supply the following restock items:\n`;

    needed.forEach((p, idx) => {
      const suggest = p.stockQuantity <= 0 ? 25 : Math.max(10, 20 - p.stockQuantity);
      text += `${idx + 1}. *${p.productName}*\n`;
      text += `   • Current Stock: ${p.stockQuantity}\n`;
      text += `   • Order Qty: *${suggest} units*\n`;
      if (p.barcode) text += `   • Barcode/SKU: ${p.barcode}\n`;
    });

    text += `\nPlease send invoice estimate and delivery ETA.\nThank you!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <>
      <PageHeader
        title="Products & Inventory"
        description="Manage your product catalog, prices, categories, and stock quantities."
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5 shadow-sm">
            <Link href="/barcodes">
              <Barcode className="h-4 w-4 text-primary" />
              Barcode Labels
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5 font-semibold shadow-sm" asChild>
            <Link href="/products/new">
              <PlusCircle className="h-4 w-4" />
              Add Product
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* ─── Top KPI Metric Cards ────────────────────────────────────────── */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 mb-2">
        <Card
          onClick={() => setStockFilter('all')}
          className={`bg-gradient-to-br from-indigo-500/10 via-card to-indigo-500/5 border-indigo-500/30 shadow-xs cursor-pointer transition hover:border-indigo-500 ${
            stockFilter === 'all' ? 'ring-2 ring-indigo-500/40' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Catalog</CardTitle>
            <div className="p-1 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Boxes className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="text-xl font-bold font-mono text-foreground">
                {totalItems} <span className="text-xs font-normal text-muted-foreground">products</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          onClick={() => setStockFilter(stockFilter === 'low_stock' ? 'all' : 'low_stock')}
          className={`bg-gradient-to-br from-amber-500/10 via-card to-amber-500/5 border-amber-500/30 shadow-xs cursor-pointer transition hover:border-amber-500 ${
            stockFilter === 'low_stock' ? 'ring-2 ring-amber-500/60' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Low Stock (&lt;10)</CardTitle>
            <div className="p-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {lowStockCount} <span className="text-xs font-normal text-muted-foreground">items</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          onClick={() => setStockFilter(stockFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
          className={`bg-gradient-to-br from-rose-500/10 via-card to-rose-500/5 border-rose-500/30 shadow-xs cursor-pointer transition hover:border-rose-500 ${
            stockFilter === 'out_of_stock' ? 'ring-2 ring-rose-500/60' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Out of Stock</CardTitle>
            <div className="p-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <PackageX className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {outOfStockCount} <span className="text-xs font-normal text-muted-foreground">items</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Inventory Asset Value</CardTitle>
            <div className="p-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ₹{totalStockValue.toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Low Stock & Auto-Reorder Alert Strip ─────────────────────── */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <div className="mb-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>Stock Restock Alert: {lowStockCount + outOfStockCount} items need attention</span>
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-xs">
                  {lowStockCount} Low • {outOfStockCount} Out
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatic re-order calculation ready for vendors & purchase orders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStockFilter(stockFilter === 'low_stock' ? 'all' : 'low_stock')}
              className="text-xs h-8 border-amber-500/30 hover:bg-amber-500/15"
            >
              {stockFilter === 'low_stock' ? 'Clear Filter' : 'Filter Low Stock'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleWhatsAppReorderList}
              className="text-xs h-8 gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Reorder on WhatsApp
            </Button>
            <Button
              size="sm"
              asChild
              className="text-xs h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              <Link href="/purchases/new">
                <PlusCircle className="h-3.5 w-3.5" />
                Create PO
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* ─── Main Product Table Card ─────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Product Catalog</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {products.length} of {totalItems} items
              </Badge>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Reset filters"
                type="button"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear Filters</span>
              </Button>
            )}
          </div>

          {/* Bottom Line: Full-width responsive filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, category, barcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 h-8 text-xs bg-background"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs w-[130px] bg-background">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stock Filter */}
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="h-8 text-xs w-[125px] bg-background">
                <SelectValue placeholder="All Stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in_stock">In Stock (&gt;0)</SelectItem>
                <SelectItem value="low_stock">Low Stock (&lt;10)</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock (0)</SelectItem>
              </SelectContent>
            </Select>

            {/* Sorting Filter */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[145px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                <SelectItem value="price-asc">Price: Low → High</SelectItem>
                <SelectItem value="price-desc">Price: High → Low</SelectItem>
                <SelectItem value="stock-asc">Stock: Low → High</SelectItem>
                <SelectItem value="stock-desc">Stock: High → Low</SelectItem>
                <SelectItem value="category-asc">Category (A → Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* Balanced column proportions: Category sits right beside Name */}
                <TableHead className="w-[32%] min-w-[200px] max-w-[340px]">Product Name</TableHead>
                <TableHead className="w-[18%] min-w-[120px]">Category</TableHead>
                <TableHead className="w-[12%] text-center">Stock</TableHead>
                <TableHead className="w-[14%] text-right">Buying Price</TableHead>
                <TableHead className="w-[14%] text-right">Selling Price</TableHead>
                <TableHead className="w-[6%] text-center">GST</TableHead>
                <TableHead className="w-[4%] text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-44" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-10 mx-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-7 w-7 ml-auto" /></TableCell>
                  </TableRow>
                ))
              )}

              {!isLoading && products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    No products match your filter criteria.
                    {hasActiveFilters && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={resetFilters}
                        className="text-xs h-auto p-0 ml-1.5 text-primary"
                      >
                        Clear all filters
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                products?.map((product) => {
                  const markupPercent =
                    product.purchasePrice > 0
                      ? Math.round(((product.sellingPrice - product.purchasePrice) / product.purchasePrice) * 100)
                      : null;

                  return (
                    <TableRow key={product.id} className="hover:bg-muted/40 transition-colors">
                      {/* Product Name + Barcode SKU */}
                      <TableCell className="font-medium">
                        <Link
                          href={`/products/edit/${product.id}`}
                          className="font-semibold text-xs text-foreground hover:text-primary hover:underline transition-colors block truncate max-w-[320px]"
                          title={product.productName}
                        >
                          {product.productName}
                        </Link>
                        {product.barcode && (
                          <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Barcode className="h-2.5 w-2.5" />
                            {product.barcode}
                          </span>
                        )}
                      </TableCell>

                      {/* Category — sits snugly right beside Product Name */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="font-normal text-[11px] bg-muted/40 border-border/80 text-foreground py-0.5 px-2"
                        >
                          {product.category || 'General'}
                        </Badge>
                      </TableCell>

                      {/* Stock Quantity Status */}
                      <TableCell className="text-center">
                        {product.stockQuantity <= 0 ? (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-semibold">
                            Out of stock
                          </Badge>
                        ) : product.stockQuantity < 10 ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-2 text-[10px] border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10 font-bold gap-1 inline-flex items-center"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                            {product.stockQuantity}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-5 px-2 text-[10px] border-border text-foreground font-semibold inline-flex items-center bg-background"
                          >
                            {product.stockQuantity}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Buying Price (Cost) */}
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        ₹{(product.purchasePrice || 0).toLocaleString()}
                      </TableCell>

                      {/* Selling Price (MRP) + Margin */}
                      <TableCell className="text-right">
                        <div className="font-bold font-mono text-xs text-foreground">
                          ₹{product.sellingPrice.toLocaleString()}
                        </div>
                        {markupPercent !== null && markupPercent > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            +{markupPercent}%
                          </span>
                        )}
                      </TableCell>

                      {/* GST % */}
                      <TableCell className="text-center text-xs font-mono text-muted-foreground">
                        {product.gstPercentage}%
                      </TableCell>

                      {/* Actions Menu */}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-haspopup="true"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Product Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => router.push(`/products/edit/${product.id}`)}>
                              <Pencil className="mr-2 h-3.5 w-3.5 text-primary" />
                              Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/barcodes?productId=${product.id}`)}>
                              <Barcode className="mr-2 h-3.5 w-3.5 text-indigo-600" />
                              Print Barcode Label
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setProductToDelete(product)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete Product
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!productToDelete}
        onOpenChange={(open) => !open && setProductToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product &ldquo;
              {productToDelete?.productName}&rdquo; from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProduct}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
