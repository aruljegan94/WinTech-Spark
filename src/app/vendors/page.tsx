'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Building2, Plus, Pencil, Trash2, Search, IndianRupee, Loader2, Phone, Mail, FileText, CheckCircle2, Wallet, AlertTriangle, Check, ArrowUpDown, RotateCcw, X, RefreshCw, Eye, Calendar as CalendarIcon, ExternalLink
} from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, query, orderBy, writeBatch, updateDoc } from 'firebase/firestore';
import type { Vendor, Purchase } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const EMPTY_VENDOR: Omit<Vendor, 'id'> = {
  name: '',
  companyName: '',
  phone: '',
  email: '',
  address: '',
  gstNo: '',
  pendingAmount: 0,
  notes: '',
};

export default function VendorsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'pending' | 'cleared'>('all');
  const [sortBy, setSortBy] = useState<string>('due-desc');
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Omit<Vendor, 'id'>>(EMPTY_VENDOR);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteVendorId, setDeleteVendorId] = useState<string | null>(null);

  // Statement modal state
  const [statementVendor, setStatementVendor] = useState<Vendor | null>(null);

  // Payment settle dialog state
  const [settleVendor, setSettleVendor] = useState<Vendor | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [autoAllocateInvoices, setAutoAllocateInvoices] = useState(true);
  const [isSettling, setIsSettling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load vendors and purchases in real-time
  const vendorsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'vendors'), orderBy('name')) : null),
    [firestore]
  );
  const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

  const purchasesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'purchases'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawPurchases, isLoading: purchasesLoading } = useCollection<Purchase>(purchasesQuery);

  const isLoading = vendorsLoading || purchasesLoading;

  // Helper to map purchases to a vendor
  const getPurchasesForVendor = useMemo(() => {
    return (vendor: Vendor): Purchase[] => {
      if (!rawPurchases) return [];
      const vComp = (vendor.companyName || '').toLowerCase().trim();
      const vName = (vendor.name || '').toLowerCase().trim();

      return rawPurchases.filter((p) => {
        if (p.vendorId && p.vendorId === vendor.id) return true;
        const supp = (p.supplierName || '').toLowerCase().trim();
        if (vComp && supp.includes(vComp)) return true;
        if (vName && supp.includes(vName)) return true;
        return false;
      });
    };
  }, [rawPurchases]);

  // Compute live financial metrics for each vendor synced with purchases
  const vendorMetricsMap = useMemo(() => {
    const map = new Map<string, {
      purchasesCount: number;
      totalBilled: number;
      totalPaid: number;
      calculatedDue: number;
      effectiveDue: number;
      purchases: Purchase[];
    }>();

    (vendors || []).forEach((vendor) => {
      const vPurchases = getPurchasesForVendor(vendor);
      let totalBilled = 0;
      let totalPaid = 0;
      let calculatedDue = 0;

      vPurchases.forEach((p) => {
        const pTotal = Number(p.totalAmount) || 0;
        const pPaid = p.amountPaid !== undefined
          ? Number(p.amountPaid)
          : (p.paymentStatus === 'Paid' ? pTotal : 0);
        const pDue = Math.max(0, pTotal - pPaid);

        totalBilled += pTotal;
        totalPaid += pPaid;
        calculatedDue += pDue;
      });

      // If purchases exist, real purchases due takes precedence; otherwise fall back to vendor.pendingAmount
      const effectiveDue = vPurchases.length > 0 ? calculatedDue : (vendor.pendingAmount || 0);

      map.set(vendor.id, {
        purchasesCount: vPurchases.length,
        totalBilled,
        totalPaid,
        calculatedDue,
        effectiveDue,
        purchases: vPurchases,
      });
    });

    return map;
  }, [vendors, getPurchasesForVendor]);

  const filteredVendors = useMemo(() => {
    let list = (vendors || []).filter((v) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.companyName.toLowerCase().includes(q) ||
        (v.gstNo && v.gstNo.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q));

      if (!matchesSearch) return false;

      const metrics = vendorMetricsMap.get(v.id);
      const due = metrics ? metrics.effectiveDue : (v.pendingAmount || 0);

      if (balanceFilter === 'pending') {
        if (due <= 0) return false;
      } else if (balanceFilter === 'cleared') {
        if (due > 0) return false;
      }

      if (startDate && v.createdAt) {
        const start = startOfDay(new Date(startDate));
        if (new Date(v.createdAt) < start) return false;
      }

      if (endDate && v.createdAt) {
        const end = endOfDay(new Date(endDate));
        if (new Date(v.createdAt) > end) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      const metricsA = vendorMetricsMap.get(a.id);
      const metricsB = vendorMetricsMap.get(b.id);
      const dueA = metricsA ? metricsA.effectiveDue : (a.pendingAmount || 0);
      const dueB = metricsB ? metricsB.effectiveDue : (b.pendingAmount || 0);
      const billedA = metricsA ? metricsA.totalBilled : 0;
      const billedB = metricsB ? metricsB.totalBilled : 0;

      switch (sortBy) {
        case 'due-desc':
          return dueB - dueA;
        case 'due-asc':
          return dueA - dueB;
        case 'billed-desc':
          return billedB - billedA;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'company-asc':
          return a.companyName.localeCompare(b.companyName);
        case 'date-desc':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case 'date-asc':
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [vendors, searchTerm, balanceFilter, startDate, endDate, sortBy, vendorMetricsMap]);

  const hasActiveFilters =
    searchTerm !== '' ||
    balanceFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '' ||
    sortBy !== 'due-desc';

  const resetFilters = () => {
    setSearchTerm('');
    setBalanceFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('due-desc');
  };

  // Grand totals across all vendors (synchronized)
  const grandTotals = useMemo(() => {
    let totalDues = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let vendorsWithDueCount = 0;

    (vendors || []).forEach((v) => {
      const metrics = vendorMetricsMap.get(v.id);
      const due = metrics ? metrics.effectiveDue : (v.pendingAmount || 0);
      const billed = metrics ? metrics.totalBilled : 0;
      const paid = metrics ? metrics.totalPaid : 0;

      totalDues += due;
      totalBilled += billed;
      totalPaid += paid;
      if (due > 0) vendorsWithDueCount++;
    });

    return { totalDues, totalBilled, totalPaid, vendorsWithDueCount };
  }, [vendors, vendorMetricsMap]);

  const openAddModal = () => {
    setEditingVendor(null);
    setForm(EMPTY_VENDOR);
    setVendorDialogOpen(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    const metrics = vendorMetricsMap.get(vendor.id);
    setForm({
      name: vendor.name || '',
      companyName: vendor.companyName || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      gstNo: vendor.gstNo || '',
      pendingAmount: metrics ? metrics.effectiveDue : (vendor.pendingAmount || 0),
      notes: vendor.notes || '',
    });
    setVendorDialogOpen(true);
  };

  const saveVendor = async () => {
    if (!firestore || !form.name.trim() || !form.companyName.trim()) {
      toast({ variant: 'destructive', title: 'Name & Company Name are required.' });
      return;
    }

    setIsSaving(true);
    try {
      const vendorId = editingVendor?.id || doc(collection(firestore, 'vendors')).id;
      await setDoc(doc(firestore, 'vendors', vendorId), {
        ...form,
        pendingAmount: Number(form.pendingAmount) || 0,
        createdAt: editingVendor?.createdAt || new Date().toISOString(),
      });

      toast({
        title: editingVendor ? 'Vendor Updated' : 'Vendor Added',
        description: `${form.companyName} (${form.name}) has been saved.`,
      });
      setVendorDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error Saving Vendor', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVendor = async () => {
    if (!firestore || !deleteVendorId) return;
    try {
      await deleteDoc(doc(firestore, 'vendors', deleteVendorId));
      toast({ title: 'Vendor Removed' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setDeleteVendorId(null);
    }
  };

  // Reconcile and synchronize all vendor balances directly with purchases collection
  const handleSyncBalances = async () => {
    if (!firestore || !vendors || !rawPurchases) return;
    setIsSyncing(true);
    try {
      const batch = writeBatch(firestore);
      let updatedCount = 0;

      for (const vendor of vendors) {
        const vPurchases = getPurchasesForVendor(vendor);
        let calculatedDue = 0;
        let totalBilled = 0;

        vPurchases.forEach((p) => {
          const pTotal = Number(p.totalAmount) || 0;
          const pPaid = p.amountPaid !== undefined
            ? Number(p.amountPaid)
            : (p.paymentStatus === 'Paid' ? pTotal : 0);
          calculatedDue += Math.max(0, pTotal - pPaid);
          totalBilled += pTotal;

          // If purchase didn't have vendorId explicitly stored, link it now
          if (!p.vendorId) {
            batch.update(doc(firestore, 'purchases', p.id), { vendorId: vendor.id });
          }
        });

        // Only update if purchases exist or pendingAmount differs
        if (vPurchases.length > 0) {
          batch.update(doc(firestore, 'vendors', vendor.id), {
            pendingAmount: calculatedDue,
            totalPurchases: totalBilled,
            totalInvoices: vPurchases.length,
          });
          updatedCount++;
        }
      }

      await batch.commit();
      toast({
        title: 'Balances Synchronized',
        description: `Successfully reconciled balances for ${updatedCount} vendors with purchase bills.`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Sync Failed', description: e.message });
    } finally {
      setIsSyncing(false);
    }
  };

  // Smart Settle Payment: allocates against FIFO purchase bills to keep Purchases page in sync
  const handleSettlePayment = async () => {
    if (!firestore || !settleVendor) return;
    const amountPaid = Number(payAmount) || 0;
    if (amountPaid <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid payment amount.' });
      return;
    }

    setIsSettling(true);
    try {
      const metrics = vendorMetricsMap.get(settleVendor.id);
      const currentDue = metrics ? metrics.effectiveDue : (settleVendor.pendingAmount || 0);
      const newPending = Math.max(0, currentDue - amountPaid);

      const batch = writeBatch(firestore);

      // If auto-allocating to purchases, distribute payment to oldest unpaid invoices (FIFO)
      if (autoAllocateInvoices && metrics && metrics.purchases.length > 0) {
        // Sort purchases chronologically (oldest first)
        const unpaidPurchases = [...metrics.purchases]
          .filter((p) => {
            const paid = p.amountPaid !== undefined ? Number(p.amountPaid) : (p.paymentStatus === 'Paid' ? p.totalAmount : 0);
            return paid < p.totalAmount;
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let remainingToDistribute = amountPaid;

        for (const p of unpaidPurchases) {
          if (remainingToDistribute <= 0) break;
          const currentPaid = p.amountPaid !== undefined ? Number(p.amountPaid) : (p.paymentStatus === 'Paid' ? p.totalAmount : 0);
          const pDue = p.totalAmount - currentPaid;

          if (remainingToDistribute >= pDue) {
            // Fully pay this purchase
            batch.update(doc(firestore, 'purchases', p.id), {
              amountPaid: p.totalAmount,
              paymentStatus: 'Paid',
            });
            remainingToDistribute -= pDue;
          } else {
            // Partially pay this purchase
            const newPaid = currentPaid + remainingToDistribute;
            batch.update(doc(firestore, 'purchases', p.id), {
              amountPaid: newPaid,
              paymentStatus: 'Partial',
            });
            remainingToDistribute = 0;
          }
        }
      }

      // Update the vendor document
      batch.update(doc(firestore, 'vendors', settleVendor.id), {
        pendingAmount: newPending,
      });

      await batch.commit();

      toast({
        title: 'Payment Recorded & Synced',
        description: `Paid ₹${amountPaid.toLocaleString()} to ${settleVendor.companyName}. Remaining due: ₹${newPending.toLocaleString()}.`,
      });
      setSettleVendor(null);
      setPayAmount('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Payment Error', description: e.message });
    } finally {
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status?: string, paid?: number, total?: number) => {
    const isFullyPaid = status === 'Paid' || (paid !== undefined && total !== undefined && paid >= total);
    if (isFullyPaid) {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">Paid</Badge>;
    }
    if (status === 'Partial') {
      return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-[10px]">Partial</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">Pending</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Vendor Management"
        description="Track supplier payables, view consolidated purchase dues, and settle payments in sync."
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncBalances}
            disabled={isSyncing || isLoading}
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            title="Recalculate and synchronize all vendor dues directly from purchase invoices"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Balances</span>
          </Button>

          <Button size="sm" className="gap-1.5" onClick={openAddModal}>
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        </div>
      </PageHeader>

      {/* Synchronized Overview Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-2">
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Suppliers</CardTitle>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Building2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold">{isLoading ? '...' : (vendors || []).length}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Registered vendors in directory</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Dues to Pay</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {isLoading ? '...' : `₹${grandTotals.totalDues.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Outstanding across all purchases</p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Vendors with Pending Dues</CardTitle>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
              {isLoading ? '...' : grandTotals.vendorsWithDueCount}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Suppliers awaiting payment</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Billed Volume</CardTitle>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoading ? '...' : `₹${grandTotals.totalBilled.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paid: ₹{grandTotals.totalPaid.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Vendor Directory & Payables</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {filteredVendors.length} {filteredVendors.length === 1 ? 'vendor' : 'vendors'}
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

          {/* Bottom Line: Full-width spacious filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search vendor, company, GST, phone..."
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

            {/* Date Range */}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date Added From"
              />
              <span className="text-muted-foreground/40 text-xs">|</span>
              <span className="text-[11px] font-medium text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date Added To"
              />
            </div>

            {/* Balance Filter */}
            <Select value={balanceFilter} onValueChange={(val: any) => setBalanceFilter(val)}>
              <SelectTrigger className="h-8 text-xs w-[130px] bg-background">
                <SelectValue placeholder="Balance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                <SelectItem value="pending">With Dues Only</SelectItem>
                <SelectItem value="cleared">Cleared (₹0 Due)</SelectItem>
              </SelectContent>
            </Select>

            {/* Sorting Filter */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[150px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="due-desc">Due: High → Low</SelectItem>
                <SelectItem value="due-asc">Due: Low → High</SelectItem>
                <SelectItem value="billed-desc">Billed Volume: High</SelectItem>
                <SelectItem value="company-asc">Company (A → Z)</SelectItem>
                <SelectItem value="name-asc">Contact (A → Z)</SelectItem>
                <SelectItem value="date-desc">Newest Added</SelectItem>
                <SelectItem value="date-asc">Oldest Added</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">Supplier & Company</TableHead>
                <TableHead className="w-[150px]">Contact Info</TableHead>
                <TableHead className="w-[130px]">GST Number</TableHead>
                <TableHead className="w-[150px]">Purchases & Billed</TableHead>
                <TableHead className="w-[120px] text-right">Total Paid</TableHead>
                <TableHead className="w-[140px] text-right font-semibold">Total Due</TableHead>
                <TableHead className="w-[130px] text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading suppliers and calculating balances...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredVendors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                    No vendors match your filter criteria.
                    {hasActiveFilters ? (
                      <Button variant="link" size="sm" onClick={resetFilters} className="text-xs h-auto p-0 ml-1.5 text-primary">
                        Clear all filters
                      </Button>
                    ) : (
                      <Button variant="link" size="sm" onClick={openAddModal} className="text-xs h-auto p-0 ml-1.5 text-primary">
                        Add Vendor
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                filteredVendors.map((vendor) => {
                  const metrics = vendorMetricsMap.get(vendor.id);
                  const effectiveDue = metrics ? metrics.effectiveDue : (vendor.pendingAmount || 0);
                  const totalBilled = metrics ? metrics.totalBilled : 0;
                  const totalPaid = metrics ? metrics.totalPaid : 0;
                  const purchasesCount = metrics ? metrics.purchasesCount : 0;

                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <div className="font-semibold text-sm leading-tight">{vendor.companyName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" /> {vendor.name}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {vendor.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-muted-foreground" /> {vendor.phone}
                            </div>
                          )}
                          {vendor.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {vendor.email}
                            </div>
                          )}
                          {!vendor.phone && !vendor.email && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>

                      <TableCell>
                        {vendor.gstNo ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {vendor.gstNo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unregistered</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="text-xs">
                          <span className="font-semibold">₹{totalBilled.toLocaleString()}</span>
                          <div className="text-[11px] text-muted-foreground">
                            {purchasesCount} {purchasesCount === 1 ? 'bill' : 'bills'}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right text-xs">
                        ₹{totalPaid.toLocaleString()}
                      </TableCell>

                      <TableCell className="text-right font-medium">
                        {effectiveDue > 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400 font-bold px-2 py-0.5"
                          >
                            ₹{effectiveDue.toLocaleString()} Due
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            Clear (₹0)
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {/* View Invoices / Statement */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setStatementVendor(vendor)}
                            title="View all purchase invoices & statement for this vendor"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span className="hidden xl:inline">Statement</span>
                          </Button>

                          {effectiveDue > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 font-medium"
                              onClick={() => {
                                setSettleVendor(vendor);
                                setPayAmount(String(effectiveDue));
                                setAutoAllocateInvoices(true);
                              }}
                            >
                              <Wallet className="h-3.5 w-3.5" /> Pay
                            </Button>
                          )}

                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditModal(vendor)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteVendorId(vendor.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Vendor Invoices & Statement Dialog */}
      <Dialog open={!!statementVendor} onOpenChange={(open) => !open && setStatementVendor(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          {statementVendor && (() => {
            const metrics = vendorMetricsMap.get(statementVendor.id);
            const vPurchases = metrics?.purchases || [];
            const effectiveDue = metrics?.effectiveDue || 0;
            const totalBilled = metrics?.totalBilled || 0;
            const totalPaid = metrics?.totalPaid || 0;

            return (
              <>
                <DialogHeader className="border-b pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <DialogTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {statementVendor.companyName}
                      </DialogTitle>
                      <DialogDescription className="text-xs mt-0.5">
                        Contact: {statementVendor.name} {statementVendor.phone ? `• ${statementVendor.phone}` : ''} {statementVendor.gstNo ? `• GST: ${statementVendor.gstNo}` : ''}
                      </DialogDescription>
                    </div>

                    {effectiveDue > 0 && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => {
                          const v = statementVendor;
                          setStatementVendor(null);
                          setSettleVendor(v);
                          setPayAmount(String(effectiveDue));
                          setAutoAllocateInvoices(true);
                        }}
                      >
                        <Wallet className="h-3.5 w-3.5" /> Settle Due (₹{effectiveDue.toLocaleString()})
                      </Button>
                    )}
                  </div>

                  {/* Summary Metric Ribbon inside Statement */}
                  <div className="grid grid-cols-4 gap-2 pt-3">
                    <div className="bg-muted/40 p-2 rounded-md border text-center">
                      <div className="text-[11px] text-muted-foreground">Invoices</div>
                      <div className="text-sm font-semibold">{vPurchases.length}</div>
                    </div>
                    <div className="bg-muted/40 p-2 rounded-md border text-center">
                      <div className="text-[11px] text-muted-foreground">Total Billed</div>
                      <div className="text-sm font-semibold">₹{totalBilled.toLocaleString()}</div>
                    </div>
                    <div className="bg-muted/40 p-2 rounded-md border text-center">
                      <div className="text-[11px] text-muted-foreground">Total Paid</div>
                      <div className="text-sm font-semibold text-emerald-600">₹{totalPaid.toLocaleString()}</div>
                    </div>
                    <div className="bg-amber-500/10 p-2 rounded-md border border-amber-500/20 text-center">
                      <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">Pending Due</div>
                      <div className="text-sm font-bold text-amber-600 dark:text-amber-400">₹{effectiveDue.toLocaleString()}</div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Purchase Invoices & Bills
                  </h4>

                  {vPurchases.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg">
                      No purchase entries recorded for this vendor yet.
                      <div className="mt-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/purchases/new">Record Purchase</Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/30">
                            <TableHead className="w-[120px]">Invoice #</TableHead>
                            <TableHead className="w-[100px]">Date</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead className="w-[100px] text-right">Total</TableHead>
                            <TableHead className="w-[100px] text-right">Paid</TableHead>
                            <TableHead className="w-[100px] text-right">Due</TableHead>
                            <TableHead className="w-[90px] text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vPurchases.map((purchase) => {
                            const pTotal = Number(purchase.totalAmount) || 0;
                            const pPaid = purchase.amountPaid !== undefined
                              ? Number(purchase.amountPaid)
                              : (purchase.paymentStatus === 'Paid' ? pTotal : 0);
                            const pDue = Math.max(0, pTotal - pPaid);

                            return (
                              <TableRow key={purchase.id}>
                                <TableCell className="font-mono text-xs font-semibold">
                                  <Link
                                    href={`/purchases/${purchase.id}`}
                                    className="hover:underline text-primary flex items-center gap-1"
                                    target="_blank"
                                  >
                                    {purchase.invoiceNo}
                                    <ExternalLink className="h-3 w-3 opacity-60" />
                                  </Link>
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                  {format(new Date(purchase.date), 'dd-MMM-yyyy')}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                  {(purchase.items || []).map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold">
                                  ₹{pTotal.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-xs text-emerald-600">
                                  ₹{pPaid.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold">
                                  {pDue > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">₹{pDue.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-muted-foreground">₹0</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {getStatusBadge(purchase.paymentStatus, pPaid, pTotal)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <DialogFooter className="border-t pt-3 flex justify-between items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    All dues aggregate dynamically in real-time.
                  </div>
                  <Button variant="outline" onClick={() => setStatementVendor(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vendor Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
            <DialogDescription>Fill in vendor and company contact details.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>Company / Firm Name *</Label>
              <Input
                placeholder="e.g. TVS Auto Spares Ltd"
                value={form.companyName}
                onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Contact Person Name *</Label>
              <Input
                placeholder="e.g. Rajesh Kumar"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Phone Number</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="vendor@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>GST Number</Label>
              <Input
                placeholder="e.g. 33AAAAA0000A1Z5"
                value={form.gstNo}
                onChange={(e) => setForm((p) => ({ ...p, gstNo: e.target.value.toUpperCase() }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Opening / Pending Balance (₹)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.pendingAmount || ''}
                onChange={(e) => setForm((p) => ({ ...p, pendingAmount: Number(e.target.value) }))}
              />
              <span className="text-[10px] text-muted-foreground">
                Will also sync with any recorded purchase bills
              </span>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Input
                placeholder="Store / Factory Address..."
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Payment terms, bank details, delivery notes..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveVendor} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingVendor ? 'Save Changes' : 'Create Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle Payment Dialog */}
      <Dialog open={!!settleVendor} onOpenChange={(open) => !open && setSettleVendor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Settle Vendor Payment
            </DialogTitle>
            <DialogDescription>
              Record a payment to <strong>{settleVendor?.companyName}</strong>.
            </DialogDescription>
          </DialogHeader>

          {settleVendor && (() => {
            const metrics = vendorMetricsMap.get(settleVendor.id);
            const currentDue = metrics ? metrics.effectiveDue : (settleVendor.pendingAmount || 0);

            return (
              <div className="space-y-4 py-2">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Total Outstanding Due:</span>
                    <strong className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                      ₹{currentDue.toLocaleString()}
                    </strong>
                  </div>
                  {metrics && metrics.purchasesCount > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Linked to {metrics.purchasesCount} purchase bill(s).
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Payment Amount to Settle (₹) *</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount paid"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => setPayAmount(String(currentDue))}
                    >
                      Pay Full Due (₹{currentDue.toLocaleString()})
                    </Button>
                    {currentDue > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => setPayAmount(String(Math.round(currentDue / 2)))}
                      >
                        50% (₹{Math.round(currentDue / 2).toLocaleString()})
                      </Button>
                    )}
                  </div>
                </div>

                {metrics && metrics.purchasesCount > 0 && (
                  <div className="flex items-start space-x-2 pt-1 border-t">
                    <Checkbox
                      id="auto-allocate"
                      checked={autoAllocateInvoices}
                      onCheckedChange={(c) => setAutoAllocateInvoices(!!c)}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <label
                        htmlFor="auto-allocate"
                        className="text-xs font-medium cursor-pointer"
                      >
                        Auto-allocate payment to oldest purchase invoices (FIFO)
                      </label>
                      <p className="text-[11px] text-muted-foreground">
                        Keeps the Purchases page in complete sync by updating individual bills to Paid / Partial.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleVendor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSettlePayment} disabled={isSettling} className="gap-1.5 bg-primary">
              {isSettling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Vendor Confirmation */}
      <AlertDialog open={!!deleteVendorId} onOpenChange={(open) => !open && setDeleteVendorId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this vendor? This will not delete historical purchases, but unlinks future balance calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVendor} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
