'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Boxes,
  ReceiptText,
  Users,
  Store,
  ShoppingCart,
  Wallet,
  X,
  ArrowRight,
  Sparkles,
  Command,
  ClipboardList,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Sale, Customer, Vendor, Purchase, Expense, PurchaseOrder } from '@/lib/types';
import { format } from 'date-fns';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'orders' | 'sales' | 'customers' | 'vendors' | 'purchases' | 'expenses'>('all');
  const [, startTransition] = useTransition();
  const router = useRouter();
  const firestore = useFirestore();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch collections lazily when dialog opens or cached by Firestore
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  const salesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sales') : null),
    [firestore]
  );
  const { data: sales } = useCollection<Sale>(salesQuery);

  const customersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'customers') : null),
    [firestore]
  );
  const { data: customers } = useCollection<Customer>(customersQuery);

  const vendorsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'vendors') : null),
    [firestore]
  );
  const { data: vendors } = useCollection<Vendor>(vendorsQuery);

  const purchasesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'purchases') : null),
    [firestore]
  );
  const { data: purchases } = useCollection<Purchase>(purchasesQuery);

  const expensesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'expenses') : null),
    [firestore]
  );
  const { data: expenses } = useCollection<Expense>(expensesQuery);

  const ordersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'purchaseOrders') : null),
    [firestore]
  );
  const { data: orders } = useCollection<PurchaseOrder>(ordersQuery);

  const q = queryText.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    if (!q || !products) return [];
    return products.filter((p) =>
      p.productName.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [products, q]);

  const filteredSales = useMemo(() => {
    if (!q || !sales) return [];
    return sales.filter((s) =>
      s.invoiceNumber.toLowerCase().includes(q) ||
      s.customerName?.toLowerCase().includes(q) ||
      s.customerMobile?.includes(q)
    ).slice(0, 6);
  }, [sales, q]);

  const filteredCustomers = useMemo(() => {
    if (!q || !customers) return [];
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.mobile?.includes(q) ||
      c.address?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [customers, q]);

  const filteredVendors = useMemo(() => {
    if (!q || !vendors) return [];
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.companyName.toLowerCase().includes(q) ||
      v.phone?.includes(q) ||
      v.gstNo?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [vendors, q]);

  const filteredPurchases = useMemo(() => {
    if (!q || !purchases) return [];
    return purchases.filter((p) =>
      p.invoiceNo.toLowerCase().includes(q) ||
      p.supplierName.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [purchases, q]);

  const filteredExpenses = useMemo(() => {
    if (!q || !expenses) return [];
    return expenses.filter((e) =>
      e.expenseType.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [expenses, q]);

  const filteredOrders = useMemo(() => {
    if (!q || !orders) return [];
    return orders.filter((o) =>
      o.orderNumber.toLowerCase().includes(q) ||
      o.vendorName.toLowerCase().includes(q) ||
      (o.items || []).some((item) => item.productName.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [orders, q]);

  const totalResults =
    filteredProducts.length +
    filteredOrders.length +
    filteredSales.length +
    filteredCustomers.length +
    filteredVendors.length +
    filteredPurchases.length +
    filteredExpenses.length;

  const navigateTo = (path: string) => {
    setOpen(false);
    startTransition(() => {
      router.push(path);
    });
  };

  return (
    <>
      {/* Trigger Button in Header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 px-2.5 sm:px-3 text-xs rounded-md border border-input bg-background/80 hover:bg-accent hover:text-accent-foreground transition-all text-muted-foreground w-36 sm:w-56 md:w-64 justify-between shadow-xs"
        title="Search anything (Cmd+K)"
        type="button"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">Search system...</span>
        </span>
        <kbd className="hidden sm:inline-flex h-4 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground shrink-0 font-semibold">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Global Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden sm:rounded-xl shadow-2xl border-border">
          <DialogHeader className="p-3 border-b bg-muted/20">
            <DialogTitle className="sr-only">Global Search</DialogTitle>
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search products, invoices, customers, vendors, purchases, expenses..."
                className="pl-9 pr-9 h-10 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {queryText && (
                <button
                  onClick={() => setQueryText('')}
                  className="absolute right-2.5 p-1 rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category tabs when searching */}
            {q && (
              <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-0.5 text-xs border-t mt-1 scrollbar-none">
                <Button
                  size="sm"
                  variant={activeTab === 'all' ? 'secondary' : 'ghost'}
                  className="h-6 text-[11px] px-2 rounded-full"
                  onClick={() => setActiveTab('all')}
                >
                  All ({totalResults})
                </Button>
                {filteredProducts.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'products' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('products')}
                  >
                    <Boxes className="h-3 w-3" /> Products ({filteredProducts.length})
                  </Button>
                )}
                {filteredOrders.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'orders' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('orders')}
                  >
                    <ClipboardList className="h-3 w-3" /> Orders ({filteredOrders.length})
                  </Button>
                )}
                {filteredSales.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'sales' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('sales')}
                  >
                    <ReceiptText className="h-3 w-3" /> Invoices ({filteredSales.length})
                  </Button>
                )}
                {filteredCustomers.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'customers' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('customers')}
                  >
                    <Users className="h-3 w-3" /> Customers ({filteredCustomers.length})
                  </Button>
                )}
                {filteredVendors.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'vendors' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('vendors')}
                  >
                    <Store className="h-3 w-3" /> Vendors ({filteredVendors.length})
                  </Button>
                )}
                {filteredPurchases.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'purchases' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('purchases')}
                  >
                    <ShoppingCart className="h-3 w-3" /> Purchases ({filteredPurchases.length})
                  </Button>
                )}
                {filteredExpenses.length > 0 && (
                  <Button
                    size="sm"
                    variant={activeTab === 'expenses' ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px] px-2 rounded-full gap-1"
                    onClick={() => setActiveTab('expenses')}
                  >
                    <Wallet className="h-3 w-3" /> Expenses ({filteredExpenses.length})
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>

          {/* Results container */}
          <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
            {!q && (
              <div className="py-6 px-4 text-center">
                <p className="text-xs text-muted-foreground mb-3">
                  Type to search across the entire Spark Billing system.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
                  <button
                    onClick={() => navigateTo('/sales/new')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <ReceiptText className="h-4 w-4 text-emerald-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Create Invoice</div>
                      <div className="text-[10px] text-muted-foreground">New sale entry</div>
                    </div>
                  </button>
                  <button
                    onClick={() => navigateTo('/products/new')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <Boxes className="h-4 w-4 text-indigo-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Add Product</div>
                      <div className="text-[10px] text-muted-foreground">Catalog item</div>
                    </div>
                  </button>
                  <button
                    onClick={() => navigateTo('/customers')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <Users className="h-4 w-4 text-sky-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Customers</div>
                      <div className="text-[10px] text-muted-foreground">Manage accounts</div>
                    </div>
                  </button>
                  <button
                    onClick={() => navigateTo('/purchases')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <ShoppingCart className="h-4 w-4 text-amber-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Purchases</div>
                      <div className="text-[10px] text-muted-foreground">Vendor orders</div>
                    </div>
                  </button>
                  <button
                    onClick={() => navigateTo('/expenses')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <Wallet className="h-4 w-4 text-rose-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Expenses</div>
                      <div className="text-[10px] text-muted-foreground">Track payouts</div>
                    </div>
                  </button>
                  <button
                    onClick={() => navigateTo('/reports')}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors flex items-center gap-2 group text-xs"
                  >
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <div>
                      <div className="font-medium group-hover:text-primary">Reports</div>
                      <div className="text-[10px] text-muted-foreground">Analytics & export</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {q && totalResults === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No matching results found for &ldquo;<span className="font-semibold text-foreground">{queryText}</span>&rdquo;
              </div>
            )}

            {/* Products Group */}
            {(activeTab === 'all' || activeTab === 'products') && filteredProducts.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Boxes className="h-3.5 w-3.5 text-indigo-500" /> Products
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredProducts.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigateTo(`/products/edit/${p.id}`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {p.productName}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{p.category}</span>
                          <span>•</span>
                          <span>Stock: {p.stockQuantity}</span>
                          {p.barcode && <span>• Barcode: {p.barcode}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">₹{p.sellingPrice.toLocaleString('en-IN')}</div>
                        <Badge variant={p.stockQuantity < 10 ? 'destructive' : 'outline'} className="text-[9px] h-4 px-1">
                          {p.stockQuantity <= 0 ? 'Out of stock' : `${p.stockQuantity} in stock`}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sales / Invoices Group */}
            {(activeTab === 'all' || activeTab === 'sales') && filteredSales.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <ReceiptText className="h-3.5 w-3.5 text-emerald-500" /> Sales & Invoices
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredSales.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredSales.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => navigateTo(`/sales/${s.id}`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {s.invoiceNumber} — {s.customerName || 'Walk-in Customer'}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{format(new Date(s.date), 'dd-MMM-yyyy')}</span>
                          {s.customerMobile && <span>• {s.customerMobile}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">₹{s.total.toLocaleString('en-IN')}</div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] h-4 px-1 ${
                            s.paymentStatus === 'Paid'
                              ? 'border-emerald-500/40 text-emerald-600'
                              : 'border-amber-500/40 text-amber-600'
                          }`}
                        >
                          {s.paymentStatus}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customers Group */}
            {(activeTab === 'all' || activeTab === 'customers') && filteredCustomers.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-sky-500" /> Customers
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredCustomers.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigateTo(`/customers`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{c.mobile || 'No phone'}</span>
                          {c.address && <span>• {c.address}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-semibold text-xs ${(c.pendingDue || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          Due: ₹{(c.pendingDue || 0).toLocaleString('en-IN')}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Spent: ₹{(c.totalSpent || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vendors Group */}
            {(activeTab === 'all' || activeTab === 'vendors') && filteredVendors.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-orange-500" /> Vendors
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredVendors.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredVendors.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => navigateTo(`/vendors`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {v.companyName} ({v.name})
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{v.phone || 'No phone'}</span>
                          {v.gstNo && <span>• GST: {v.gstNo}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-semibold text-xs ${(v.pendingAmount || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          Pending: ₹{(v.pendingAmount || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Orders Group */}
            {(activeTab === 'all' || activeTab === 'orders') && filteredOrders.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 text-indigo-500" /> Purchase Orders
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredOrders.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => navigateTo(`/orders`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {o.orderNumber} — {o.vendorName}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{format(new Date(o.date), 'dd-MMM-yyyy')}</span>
                          <span>• {(o.items || []).length} items</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">₹{o.totalEstimatedAmount.toLocaleString('en-IN')}</div>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {o.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(activeTab === 'all' || activeTab === 'purchases') && filteredPurchases.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5 text-amber-500" /> Purchases
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredPurchases.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredPurchases.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigateTo(`/purchases`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          Invoice #{p.invoiceNo} — {p.supplierName}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{format(new Date(p.date), 'dd-MMM-yyyy')}</span>
                          <span>• {(p.items || []).length} items</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">₹{p.totalAmount.toLocaleString('en-IN')}</div>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {p.paymentStatus}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Expenses Group */}
            {(activeTab === 'all' || activeTab === 'expenses') && filteredExpenses.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-rose-500" /> Expenses
                  </span>
                  <span className="text-[10px] lowercase font-normal">{filteredExpenses.length} matches</span>
                </div>
                <div className="space-y-0.5">
                  {filteredExpenses.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => navigateTo(`/expenses`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-foreground group-hover:text-primary truncate">
                          {e.expenseType}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span>{format(new Date(e.date), 'dd-MMM-yyyy')}</span>
                          {e.notes && <span>• {e.notes}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">₹{e.amount.toLocaleString('en-IN')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-2 border-t bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Press <kbd className="px-1 rounded bg-muted border font-mono">Esc</kbd> to close</span>
            <span className="flex items-center gap-1 text-primary cursor-pointer hover:underline" onClick={() => setOpen(false)}>
              Jump to module <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
