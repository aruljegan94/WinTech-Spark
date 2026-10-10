'use client';

import { useState, useMemo, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useDoc,
} from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import type {
  Sale,
  Expense,
  Customer,
  Employee,
  CompanyProfile,
  SettlementChecklistRecord,
  MechanicCommissionRecord,
  Purchase,
  Product,
  ServiceSettlementRecord,
} from '@/lib/types';
import {
  format,
  isSameDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  subDays,
  parseISO,
} from 'date-fns';
import {
  ClipboardCheck,
  Wallet,
  CreditCard,
  Banknote,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wrench,
  Percent,
  Calendar,
  Save,
  MessageCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  ShieldCheck,
  Trash2,
  Check,
  AlertTriangle,
  Search,
  RotateCcw,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ChecklistPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>('daily');

  // ── 1. Fetch Collections ───────────────────────────────────────────────────
  const salesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'sales'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawSales, isLoading: loadingSales } = useCollection<Sale>(salesQuery);

  const expensesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'expenses'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawExpenses, isLoading: loadingExpenses } = useCollection<Expense>(expensesQuery);

  const purchasesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'purchases'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawPurchases } = useCollection<Purchase>(purchasesQuery);

  const customersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'customers') : null),
    [firestore]
  );
  const { data: rawCustomers } = useCollection<Customer>(customersQuery);

  const employeesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'employees') : null),
    [firestore]
  );
  const { data: rawEmployees } = useCollection<Employee>(employeesQuery);

  const auditsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'settlementAudits'), orderBy('verifiedAt', 'desc')) : null),
    [firestore]
  );
  const { data: rawAudits } = useCollection<SettlementChecklistRecord>(auditsQuery);

  const commissionsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'mechanicCommissions'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawCommissions } = useCollection<MechanicCommissionRecord>(commissionsQuery);

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  // Products collection to check category === 'Service'
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: rawProducts } = useCollection<Product>(productsQuery);

  // Service Settlements collection (persists Settled vs Pending status)
  const serviceSettlementsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'serviceSettlements') : null),
    [firestore]
  );
  const { data: rawServiceSettlements } = useCollection<ServiceSettlementRecord>(serviceSettlementsQuery);

  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    rawProducts?.forEach((p) => map.set(p.id, p));
    return map;
  }, [rawProducts]);

  const serviceSettlementMap = useMemo(() => {
    const map = new Map<string, ServiceSettlementRecord>();
    rawServiceSettlements?.forEach((s) => map.set(s.id, s));
    return map;
  }, [rawServiceSettlements]);

  // Helper: check if a sale item belongs to Category "Service"
  const isServiceItem = (item: { productId?: string; productName: string }) => {
    const prod = item.productId ? productsMap.get(item.productId) : undefined;
    const cat = (prod?.category || '').toLowerCase().trim();
    if (cat === 'service' || cat === 'services' || cat === 'labor' || cat === 'labour') {
      return true;
    }
    const name = (item.productName || '').toLowerCase().trim();
    return (
      name.includes('service') ||
      name.includes('labour') ||
      name.includes('labor') ||
      name.includes('fitting') ||
      name.includes('wash') ||
      name.includes('repair') ||
      name.includes('alignment') ||
      name.includes('balancing')
    );
  };

  // Helper: extract and enrich all service items from an array of sales
  const extractServiceItems = (salesList: Sale[]) => {
    const list: Array<{
      id: string;
      saleId: string;
      invoiceNumber: string;
      date: string;
      customerName: string;
      customerMobile: string;
      productId: string;
      productName: string;
      category: string;
      quantity: number;
      price: number;
      total: number;
      paymentMode: string;
      paymentStatus: string;
      status: 'Settled' | 'Pending';
      settledAt?: string;
      settledBy?: string;
      notes?: string;
    }> = [];

    salesList.forEach((sale) => {
      (sale.items || []).forEach((item, idx) => {
        if (isServiceItem(item)) {
          const id = `${sale.id}_${idx}`;
          const existing = serviceSettlementMap.get(id);
          const prod = item.productId ? productsMap.get(item.productId) : undefined;
          list.push({
            id,
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            date: sale.date,
            customerName: sale.customerName || 'Walk-in Customer',
            customerMobile: sale.customerMobile || '',
            productId: item.productId,
            productName: item.productName,
            category: prod?.category || 'Service',
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            paymentMode: sale.paymentMode || 'Cash',
            paymentStatus: sale.paymentStatus || 'Paid',
            status: existing?.status || 'Pending',
            settledAt: existing?.settledAt,
            settledBy: existing?.settledBy,
            notes: existing?.notes,
          });
        }
      });
    });
    return list;
  };

  // ── TAB 1: DAILY SETTLEMENT STATE ──────────────────────────────────────────
  const [dailyDate, setDailyDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [physicalCashInput, setPhysicalCashInput] = useState<string>('');
  const [actualUpiInput, setActualUpiInput] = useState<string>('');
  const [dailyNotes, setDailyNotes] = useState<string>('');
  const [showDenominations, setShowDenominations] = useState<boolean>(false);
  const [dailyServiceFilter, setDailyServiceFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [denominations, setDenominations] = useState({
    d500: '',
    d200: '',
    d100: '',
    d50: '',
    d20: '',
    d10: '',
    coins: '',
  });

  // Dedicated Service Tab state
  const [servicesTabPeriod, setServicesTabPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('daily');
  const [servicesTabFilter, setServicesTabFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [servicesTabSearch, setServicesTabSearch] = useState<string>('');
  const [showWeeklyServices, setShowWeeklyServices] = useState<boolean>(false);
  const [showMonthlyServices, setShowMonthlyServices] = useState<boolean>(false);

  // Daily checklist items
  const [dailyChecks, setDailyChecks] = useState<Record<string, boolean>>({
    cashCounted: false,
    upiVerified: false,
    expensesLogged: false,
    pendingFollowedUp: false,
    serviceSettled: false,
    drawerClosed: false,
  });

  // Calculate sum from denomination inputs
  const calculatedDenomTotal = useMemo(() => {
    const v500 = (parseInt(denominations.d500) || 0) * 500;
    const v200 = (parseInt(denominations.d200) || 0) * 200;
    const v100 = (parseInt(denominations.d100) || 0) * 100;
    const v50 = (parseInt(denominations.d50) || 0) * 50;
    const v20 = (parseInt(denominations.d20) || 0) * 20;
    const v10 = (parseInt(denominations.d10) || 0) * 10;
    const vCoins = parseFloat(denominations.coins) || 0;
    return v500 + v200 + v100 + v50 + v20 + v10 + vCoins;
  }, [denominations]);

  const handleApplyDenominations = () => {
    setPhysicalCashInput(calculatedDenomTotal.toString());
    toast({
      title: 'Denomination Applied',
      description: `Counted Cash total ₹${calculatedDenomTotal.toLocaleString()} set.`,
    });
  };

  // Daily Calculations
  const dailyMetrics = useMemo(() => {
    if (!rawSales) {
      return {
        cashSales: 0,
        upiSales: 0,
        bankSales: 0,
        totalSales: 0,
        cashExpenses: 0,
        expectedCash: 0,
        pendingSalesList: [],
        totalPendingToday: 0,
        serviceItems: [] as ReturnType<typeof extractServiceItems>,
        serviceTotal: 0,
        serviceSettled: 0,
        servicePending: 0,
      };
    }

    const selectedTargetDate = new Date(dailyDate);

    // Sales created or dated on this day
    const daySales = rawSales.filter((s) => {
      try {
        return isSameDay(new Date(s.date), selectedTargetDate);
      } catch {
        return false;
      }
    });

    let cashSales = 0;
    let upiSales = 0;
    let bankSales = 0;
    let totalSales = 0;
    const pendingSalesList: Array<Sale & { dueAmount: number }> = [];

    daySales.forEach((sale) => {
      const paid = sale.amountPaid !== undefined
        ? sale.amountPaid
        : (sale.paymentStatus === 'Paid' ? sale.total : 0);
      const disc = sale.discount || 0;
      const due = Math.max(0, Math.round((sale.total - paid - disc) * 100) / 100);

      totalSales += sale.total;

      if (paid > 0) {
        if (sale.paymentMode === 'Cash') {
          cashSales += paid;
        } else if (sale.paymentMode === 'UPI') {
          upiSales += paid;
        } else {
          bankSales += paid;
        }
      }

      if (sale.paymentStatus !== 'Paid' && due > 0) {
        pendingSalesList.push({ ...sale, dueAmount: due });
      }
    });

    // Expenses on this day
    const dayExpenses = (rawExpenses || []).filter((e) => {
      try {
        return isSameDay(new Date(e.date), selectedTargetDate);
      } catch {
        return false;
      }
    });

    const cashExpenses = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const expectedCash = Math.max(0, Math.round((cashSales - cashExpenses) * 100) / 100);
    const totalPendingToday = pendingSalesList.reduce((sum, item) => sum + item.dueAmount, 0);

    // Category: Service items from daily invoices
    const dayServiceItems = extractServiceItems(daySales);
    const serviceTotal = Math.round(dayServiceItems.reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const serviceSettled = Math.round(
      dayServiceItems.filter((i) => i.status === 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;
    const servicePending = Math.round(
      dayServiceItems.filter((i) => i.status !== 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;

    return {
      cashSales,
      upiSales,
      bankSales,
      totalSales,
      cashExpenses,
      expectedCash,
      pendingSalesList,
      totalPendingToday,
      serviceItems: dayServiceItems,
      serviceTotal,
      serviceSettled,
      servicePending,
    };
  }, [rawSales, rawExpenses, rawProducts, rawServiceSettlements, dailyDate]);

  // Saved audit record for selected dailyDate
  const savedDailyAudit = useMemo(() => {
    return rawAudits?.find((a) => a.periodKey === dailyDate && a.type === 'daily');
  }, [rawAudits, dailyDate]);

  useEffect(() => {
    if (savedDailyAudit) {
      setPhysicalCashInput(savedDailyAudit.physicalCash.toString());
      setActualUpiInput(savedDailyAudit.actualUpi.toString());
      setDailyNotes(savedDailyAudit.notes || '');
      setDailyChecks(savedDailyAudit.checks || {});
    }
  }, [savedDailyAudit]);

  const physicalCashNum = parseFloat(physicalCashInput) || 0;
  const cashVariance = Math.round((physicalCashNum - dailyMetrics.expectedCash) * 100) / 100;

  const actualUpiNum = parseFloat(actualUpiInput) || 0;
  const upiVariance = Math.round((actualUpiNum - dailyMetrics.upiSales) * 100) / 100;

  const handleSaveDailyAudit = async () => {
    if (!firestore) return;
    try {
      const auditId = `daily_${dailyDate}`;
      const status: SettlementChecklistRecord['status'] =
        Math.abs(cashVariance) <= 1 && Math.abs(upiVariance) <= 1 ? 'Reconciled' : 'Discrepancy';

      const payload: SettlementChecklistRecord = {
        id: auditId,
        type: 'daily',
        periodKey: dailyDate,
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'Store Manager',
        status,
        systemCash: dailyMetrics.expectedCash,
        physicalCash: physicalCashNum,
        cashVariance,
        systemUpi: dailyMetrics.upiSales,
        actualUpi: actualUpiNum,
        upiVariance,
        totalExpenses: dailyMetrics.cashExpenses,
        pendingReceivables: dailyMetrics.totalPendingToday,
        serviceTotal: dailyMetrics.serviceTotal,
        serviceSettled: dailyMetrics.serviceSettled,
        servicePending: dailyMetrics.servicePending,
        checks: dailyChecks,
        notes: dailyNotes.trim(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(firestore, 'settlementAudits', auditId), payload);
      toast({
        title: 'Daily Settlement Audit Saved!',
        description: `Reconciliation for ${format(new Date(dailyDate), 'dd-MMM-yyyy')} is logged. Status: ${status}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: err.message,
      });
    }
  };

  // ── TAB 2: WEEKLY AUDIT STATE & METRICS ────────────────────────────────────
  const [weeklyReferenceDate, setWeeklyReferenceDate] = useState<Date>(new Date());
  const [weeklyLackingNotes, setWeeklyLackingNotes] = useState<string>('');
  const [weeklyChecks, setWeeklyChecks] = useState<Record<string, boolean>>({
    vendorBillsChecked: false,
    mechanicWagesAudited: false,
    creditCustomerFollowed: false,
    partsStockChecked: false,
  });

  const weekInterval = useMemo(() => {
    return {
      start: startOfWeek(weeklyReferenceDate, { weekStartsOn: 1 }),
      end: endOfWeek(weeklyReferenceDate, { weekStartsOn: 1 }),
    };
  }, [weeklyReferenceDate]);

  const weeklyMetrics = useMemo(() => {
    if (!rawSales) return null;

    const weekSales = rawSales.filter((s) => {
      try {
        const d = new Date(s.date);
        return isWithinInterval(d, weekInterval);
      } catch {
        return false;
      }
    });

    let totalBilled = 0;
    let cashCollected = 0;
    let upiCollected = 0;
    let totalCollected = 0;
    let pendingUnpaid = 0;

    weekSales.forEach((s) => {
      totalBilled += s.total;
      const paid = s.amountPaid !== undefined
        ? s.amountPaid
        : (s.paymentStatus === 'Paid' ? s.total : 0);
      const disc = s.discount || 0;
      const due = Math.max(0, s.total - paid - disc);

      totalCollected += paid;
      pendingUnpaid += due;

      if (paid > 0) {
        if (s.paymentMode === 'Cash') cashCollected += paid;
        else if (s.paymentMode === 'UPI') upiCollected += paid;
      }
    });

    const weekExpenses = (rawExpenses || [])
      .filter((e) => {
        try {
          return isWithinInterval(new Date(e.date), weekInterval);
        } catch {
          return false;
        }
      })
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 100;
    const netCashFlow = totalCollected - weekExpenses;

    // Category: Service items for the week
    const weeklyServiceItems = extractServiceItems(weekSales);
    const weeklyServiceTotal = Math.round(weeklyServiceItems.reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const weeklyServiceSettled = Math.round(
      weeklyServiceItems.filter((i) => i.status === 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;
    const weeklyServicePending = Math.round(
      weeklyServiceItems.filter((i) => i.status !== 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;

    return {
      totalBilled,
      cashCollected,
      upiCollected,
      totalCollected,
      pendingUnpaid,
      weekExpenses,
      collectionRate,
      netCashFlow,
      count: weekSales.length,
      serviceItems: weeklyServiceItems,
      serviceTotal: weeklyServiceTotal,
      serviceSettled: weeklyServiceSettled,
      servicePending: weeklyServicePending,
    };
  }, [rawSales, rawExpenses, rawProducts, rawServiceSettlements, weekInterval]);

  // ── TAB 3: MONTHLY SETTLEMENT & METRICS ────────────────────────────────────
  const [monthlyDate, setMonthlyDate] = useState<Date>(new Date());
  const [monthlyChecks, setMonthlyChecks] = useState<Record<string, boolean>>({
    bankReconciled: false,
    vendorBalancesTallied: false,
    inventoryCountVerified: false,
    taxReportReviewed: false,
  });
  const [monthlyActionNotes, setMonthlyActionNotes] = useState<string>('');

  const monthlyMetrics = useMemo(() => {
    if (!rawSales) return null;

    const mStart = startOfMonth(monthlyDate);
    const mEnd = endOfMonth(monthlyDate);
    const mInterval = { start: mStart, end: mEnd };

    const mSales = rawSales.filter((s) => {
      try {
        return isWithinInterval(new Date(s.date), mInterval);
      } catch {
        return false;
      }
    });

    const totalRevenue = mSales.reduce((sum, s) => sum + s.total, 0);
    const totalCollected = mSales.reduce((sum, s) => {
      const paid = s.amountPaid !== undefined
        ? s.amountPaid
        : (s.paymentStatus === 'Paid' ? s.total : 0);
      return sum + paid;
    }, 0);

    const mExpenses = (rawExpenses || [])
      .filter((e) => {
        try {
          return isWithinInterval(new Date(e.date), mInterval);
        } catch {
          return false;
        }
      })
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const mPurchases = (rawPurchases || [])
      .filter((p) => {
        try {
          return isWithinInterval(new Date(p.date), mInterval);
        } catch {
          return false;
        }
      })
      .reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    const grossMargin = totalRevenue - mPurchases;
    const netOperatingProfit = grossMargin - mExpenses;
    const totalShopReceivables = (rawCustomers || []).reduce((sum, c) => sum + (c.pendingDue || 0), 0);

    // Category: Service items for the month
    const monthlyServiceItems = extractServiceItems(mSales);
    const monthlyServiceTotal = Math.round(monthlyServiceItems.reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const monthlyServiceSettled = Math.round(
      monthlyServiceItems.filter((i) => i.status === 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;
    const monthlyServicePending = Math.round(
      monthlyServiceItems.filter((i) => i.status !== 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100
    ) / 100;

    return {
      totalRevenue,
      totalCollected,
      mExpenses,
      mPurchases,
      grossMargin,
      netOperatingProfit,
      totalShopReceivables,
      salesCount: mSales.length,
      serviceItems: monthlyServiceItems,
      serviceTotal: monthlyServiceTotal,
      serviceSettled: monthlyServiceSettled,
      servicePending: monthlyServicePending,
    };
  }, [rawSales, rawExpenses, rawPurchases, rawCustomers, rawProducts, rawServiceSettlements, monthlyDate]);

  // All time service items for dedicated Service tab
  const allServiceItems = useMemo(() => {
    if (!rawSales) return [];
    return extractServiceItems(rawSales);
  }, [rawSales, rawProducts, rawServiceSettlements]);

  // Action: Toggle a single service item between Settled and Pending
  const handleToggleServiceSettlement = async (item: {
    id: string;
    saleId: string;
    invoiceNumber: string;
    date: string;
    customerName: string;
    customerMobile: string;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    status: 'Settled' | 'Pending';
  }) => {
    if (!firestore) return;
    const newStatus: 'Settled' | 'Pending' = item.status === 'Settled' ? 'Pending' : 'Settled';
    try {
      const ref = doc(firestore, 'serviceSettlements', item.id);
      const payload: ServiceSettlementRecord = {
        id: item.id,
        saleId: item.saleId,
        invoiceNumber: item.invoiceNumber,
        date: item.date,
        customerName: item.customerName,
        customerMobile: item.customerMobile,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        status: newStatus,
        settledAt: newStatus === 'Settled' ? new Date().toISOString() : undefined,
        settledBy: newStatus === 'Settled' ? 'Store Manager' : undefined,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(ref, payload, { merge: true });
      toast({
        title: newStatus === 'Settled' ? 'Service Settled' : 'Marked as Pending',
        description: `${item.productName} (Invoice #${item.invoiceNumber}) marked as ${newStatus}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: err.message,
      });
    }
  };

  // Action: Bulk set all services in a list as Settled or Pending
  const handleBulkSetServiceSettlement = async (
    itemsList: Array<{
      id: string;
      saleId: string;
      invoiceNumber: string;
      date: string;
      customerName: string;
      customerMobile: string;
      productId: string;
      productName: string;
      quantity: number;
      price: number;
      total: number;
      status: 'Settled' | 'Pending';
    }>,
    targetStatus: 'Settled' | 'Pending'
  ) => {
    if (!firestore || itemsList.length === 0) return;
    const targetItems = itemsList.filter((i) => i.status !== targetStatus);
    if (targetItems.length === 0) {
      toast({
        title: `Already ${targetStatus}`,
        description: `All items are already marked as ${targetStatus}.`,
      });
      return;
    }
    try {
      await Promise.all(
        targetItems.map((item) => {
          const ref = doc(firestore, 'serviceSettlements', item.id);
          return setDoc(
            ref,
            {
              id: item.id,
              saleId: item.saleId,
              invoiceNumber: item.invoiceNumber,
              date: item.date,
              customerName: item.customerName,
              customerMobile: item.customerMobile,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              price: item.price,
              total: item.total,
              status: targetStatus,
              settledAt: targetStatus === 'Settled' ? new Date().toISOString() : undefined,
              settledBy: targetStatus === 'Settled' ? 'Store Manager' : undefined,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        })
      );
      toast({
        title: `Bulk Update Complete`,
        description: `Marked ${targetItems.length} service item(s) as ${targetStatus}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Bulk Update Failed',
        description: err.message,
      });
    }
  };

  // ── TAB 4: MECHANIC COMMISSION CALCULATOR STATE ────────────────────────────
  const [selectedMechanic, setSelectedMechanic] = useState<string>('');
  const [customMechanicName, setCustomMechanicName] = useState<string>('');
  const [mechanicPhone, setMechanicPhone] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(5); // Default 5%
  const [billAmountInput, setBillAmountInput] = useState<string>('');
  const [bonusInput, setBonusInput] = useState<string>('');
  const [deductionsInput, setDeductionsInput] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [commissionPaymentMode, setCommissionPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [commissionNotes, setCommissionNotes] = useState<string>('');
  const [isSavingCommission, setIsSavingCommission] = useState<boolean>(false);

  // When an existing invoice is selected, populate billAmount automatically
  const handleSelectInvoice = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) return;
    const inv = rawSales?.find((s) => s.id === invId);
    if (inv) {
      setBillAmountInput(inv.total.toString());
      if (inv.customerName) {
        setCommissionNotes(`Invoice #${inv.invoiceNumber} (${inv.customerName})`);
      }
    }
  };

  // Commission Calculations
  const billAmount = parseFloat(billAmountInput) || 0;
  const bonus = parseFloat(bonusInput) || 0;
  const deductions = parseFloat(deductionsInput) || 0;

  const baseCommission = Math.round(((billAmount * commissionRate) / 100) * 100) / 100;
  const netCommissionPayable = Math.max(0, Math.round((baseCommission + bonus - deductions) * 100) / 100);

  const activeMechanicName =
    selectedMechanic && selectedMechanic !== 'custom'
      ? rawEmployees?.find((e) => e.id === selectedMechanic)?.name || 'Mechanic'
      : customMechanicName || 'Mechanic';

  const handleRecordCommission = async () => {
    if (!firestore) return;
    if (billAmount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Bill Amount',
        description: 'Please enter a valid bill amount greater than ₹0.',
      });
      return;
    }

    if (!activeMechanicName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mechanic Required',
        description: 'Please select or enter the mechanic name.',
      });
      return;
    }

    setIsSavingCommission(true);
    try {
      const newRef = doc(collection(firestore, 'mechanicCommissions'));
      const chosenInvoice = rawSales?.find((s) => s.id === selectedInvoiceId);

      const record: MechanicCommissionRecord = {
        id: newRef.id,
        date: new Date().toISOString(),
        mechanicName: activeMechanicName.trim(),
        mechanicPhone: mechanicPhone.trim() || undefined,
        mechanicId: selectedMechanic !== 'custom' ? selectedMechanic : undefined,
        invoiceNumber: chosenInvoice?.invoiceNumber || undefined,
        saleId: chosenInvoice?.id || undefined,
        billAmount,
        commissionRate,
        commissionAmount: baseCommission,
        bonusAmount: bonus > 0 ? bonus : undefined,
        deductions: deductions > 0 ? deductions : undefined,
        netPayable: netCommissionPayable,
        paymentStatus: 'Paid',
        paymentMode: commissionPaymentMode,
        notes: commissionNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await setDoc(newRef, record);

      toast({
        title: 'Commission Payout Recorded!',
        description: `₹${netCommissionPayable.toLocaleString()} logged for ${activeMechanicName} (${commissionRate}% on ₹${billAmount.toLocaleString()}).`,
      });

      // Reset form
      setBillAmountInput('');
      setBonusInput('');
      setDeductionsInput('');
      setSelectedInvoiceId('');
      setCommissionNotes('');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Record Commission',
        description: err.message,
      });
    } finally {
      setIsSavingCommission(false);
    }
  };

  const handleSendWhatsAppCommissionSlip = () => {
    const compName = companyProfile?.companyName || 'WinTech-Spark';
    let text = `🛠️ *MECHANIC COMMISSION SLIP - ${compName}*\n\n`;
    text += `👨‍🔧 *Mechanic:* ${activeMechanicName}\n`;
    text += `📅 *Date:* ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}\n`;
    if (selectedInvoiceId) {
      const inv = rawSales?.find((s) => s.id === selectedInvoiceId);
      if (inv) text += `📄 *Invoice #:* ${inv.invoiceNumber}\n`;
    }
    text += `💵 *Job / Bill Amount:* ₹${billAmount.toLocaleString()}\n`;
    text += `⚡ *Commission Rate:* ${commissionRate}%\n`;
    text += `💰 *Base Commission:* ₹${baseCommission.toLocaleString()}\n`;
    if (bonus > 0) text += `🎁 *Bonus / Extra:* +₹${bonus.toLocaleString()}\n`;
    if (deductions > 0) text += `✂️ *Deductions / Advance:* -₹${deductions.toLocaleString()}\n`;
    text += `\n⭐ *NET PAYABLE: ₹${netCommissionPayable.toLocaleString()}*\n`;
    text += `💳 *Paid via:* ${commissionPaymentMode}\n\n`;
    if (commissionNotes) text += `📝 *Note:* ${commissionNotes}\n\n`;
    text += `Thank you for your quality service!\n— *${compName}*`;

    let phone = mechanicPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleSendWhatsAppPendingReminder = (saleItem: Sale & { dueAmount: number }) => {
    const compName = companyProfile?.companyName || 'WinTech-Spark';
    let text = `🔔 *PAYMENT REMINDER - ${compName}*\n\n`;
    text += `Dear *${saleItem.customerName || 'Customer'}*,\n`;
    text += `This is a friendly reminder regarding your outstanding bill:\n`;
    text += `📄 *Invoice #:* ${saleItem.invoiceNumber}\n`;
    text += `📅 *Date:* ${format(new Date(saleItem.date), 'dd-MMM-yyyy')}\n`;
    text += `💵 *Bill Total:* ₹${saleItem.total.toLocaleString()}\n`;
    text += `⚠️ *Balance Due:* ₹${saleItem.dueAmount.toLocaleString()}\n\n`;
    if (companyProfile?.upiId) {
      text += `📲 Pay directly via UPI: ${companyProfile.upiId}\n\n`;
    }
    text += `Kindly settle at your earliest convenience.\nThank you! — *${compName}*`;

    let phone = (saleItem.customerMobile || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const totalCommissionsMonth = useMemo(() => {
    if (!rawCommissions) return 0;
    const now = new Date();
    return rawCommissions
      .filter((c) => {
        try {
          const d = new Date(c.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } catch {
          return false;
        }
      })
      .reduce((sum, c) => sum + (c.netPayable || 0), 0);
  }, [rawCommissions]);

  // Dedicated Service Tab Scoped Metrics & Filtering
  const scopedServiceMetrics = useMemo(() => {
    let baseList = allServiceItems;
    let label = 'All Invoices';
    if (servicesTabPeriod === 'daily') {
      const targetDate = new Date(dailyDate);
      baseList = allServiceItems.filter((i) => {
        try {
          return isSameDay(new Date(i.date), targetDate);
        } catch {
          return false;
        }
      });
      label = format(targetDate, 'dd-MMM-yyyy');
    } else if (servicesTabPeriod === 'weekly') {
      baseList = allServiceItems.filter((i) => {
        try {
          return isWithinInterval(new Date(i.date), weekInterval);
        } catch {
          return false;
        }
      });
      label = `${format(weekInterval.start, 'dd-MMM')} — ${format(weekInterval.end, 'dd-MMM-yyyy')}`;
    } else if (servicesTabPeriod === 'monthly') {
      const mInterval = { start: startOfMonth(monthlyDate), end: endOfMonth(monthlyDate) };
      baseList = allServiceItems.filter((i) => {
        try {
          return isWithinInterval(new Date(i.date), mInterval);
        } catch {
          return false;
        }
      });
      label = format(monthlyDate, 'MMMM yyyy');
    }

    const total = Math.round(baseList.reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const settled = Math.round(baseList.filter((i) => i.status === 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const pending = Math.round(baseList.filter((i) => i.status !== 'Settled').reduce((acc, i) => acc + (i.total || 0), 0) * 100) / 100;
    const settledCount = baseList.filter((i) => i.status === 'Settled').length;
    const pendingCount = baseList.filter((i) => i.status !== 'Settled').length;
    const rate = total > 0 ? Math.round((settled / total) * 100) : 100;

    return {
      items: baseList,
      total,
      settled,
      pending,
      settledCount,
      pendingCount,
      rate,
      label,
    };
  }, [allServiceItems, servicesTabPeriod, dailyDate, weekInterval, monthlyDate]);

  const displayedServiceItems = useMemo(() => {
    return scopedServiceMetrics.items.filter((item) => {
      if (servicesTabFilter === 'pending' && item.status !== 'Pending') return false;
      if (servicesTabFilter === 'settled' && item.status !== 'Settled') return false;

      if (servicesTabSearch.trim()) {
        const query = servicesTabSearch.toLowerCase().trim();
        const matchInvoice = item.invoiceNumber.toLowerCase().includes(query);
        const matchCustomer = item.customerName.toLowerCase().includes(query);
        const matchMobile = item.customerMobile.includes(query);
        const matchService = item.productName.toLowerCase().includes(query);
        if (!matchInvoice && !matchCustomer && !matchMobile && !matchService) {
          return false;
        }
      }
      return true;
    });
  }, [scopedServiceMetrics.items, servicesTabFilter, servicesTabSearch]);

  const handleSendWhatsAppServiceSettlementSummary = () => {
    const compName = companyProfile?.companyName || 'WinTech-Spark';
    let text = `🛠️ *SERVICE SETTLEMENT REPORT - ${compName}*\n\n`;
    text += `📅 *Period:* ${scopedServiceMetrics.label}\n`;
    text += `💼 *Total Services Billed:* ₹${scopedServiceMetrics.total.toLocaleString()} (${scopedServiceMetrics.items.length} jobs)\n`;
    text += `✅ *Settled Amount:* ₹${scopedServiceMetrics.settled.toLocaleString()} (${scopedServiceMetrics.settledCount} jobs)\n`;
    text += `⏳ *Pending Amount:* ₹${scopedServiceMetrics.pending.toLocaleString()} (${scopedServiceMetrics.pendingCount} jobs)\n`;
    text += `📊 *Settlement Progress:* ${scopedServiceMetrics.rate}%\n\n`;

    if (scopedServiceMetrics.pendingCount > 0) {
      text += `*⚠️ Pending Services to Settle:*\n`;
      scopedServiceMetrics.items
        .filter((i) => i.status !== 'Settled')
        .slice(0, 10)
        .forEach((i, idx) => {
          text += `${idx + 1}. #${i.invoiceNumber} - ${i.productName} (₹${i.total.toLocaleString()})\n`;
        });
      if (scopedServiceMetrics.pendingCount > 10) {
        text += `...and ${scopedServiceMetrics.pendingCount - 10} more pending jobs.\n`;
      }
      text += `\n`;
    }

    text += `Report generated from BillingSoft Finance Checklist.`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Finance & Settlement Checklist"
        description="Verify daily Cash & UPI settlements, audit weekly and monthly performance gaps, and calculate mechanic commissions."
      >
        <Badge variant="outline" className="gap-1.5 py-1 px-3 bg-card border-primary/30 text-xs">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Audit Engine Active</span>
        </Badge>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="daily" className="gap-2 py-2 text-xs md:text-sm font-semibold">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <span>Daily Settlement</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-2 py-2 text-xs md:text-sm font-semibold">
            <Wrench className="h-4 w-4 text-cyan-600" />
            <span>Service Settlements</span>
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-2 py-2 text-xs md:text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <span>Weekly Audit</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2 py-2 text-xs md:text-sm font-semibold">
            <Layers className="h-4 w-4 text-purple-600" />
            <span>Monthly P&L Audit</span>
          </TabsTrigger>
          <TabsTrigger value="commission" className="gap-2 py-2 text-xs md:text-sm font-semibold">
            <Wrench className="h-4 w-4 text-amber-600" />
            <span>Mechanic Commission</span>
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: DAILY SETTLEMENT & CASH/UPI RECONCILIATION
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-4">
          {/* Top Date Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="daily-date-picker" className="text-xs font-semibold">
                Settlement Date:
              </Label>
              <Input
                id="daily-date-picker"
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="h-8 text-xs w-36 font-semibold"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={dailyDate === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDailyDate(format(new Date(), 'yyyy-MM-dd'))}
                className="h-7 text-xs"
              >
                Today
              </Button>
              <Button
                variant={dailyDate === format(subDays(new Date(), 1), 'yyyy-MM-dd') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDailyDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
                className="h-7 text-xs"
              >
                Yesterday
              </Button>
              {savedDailyAudit && (
                <Badge
                  className={`text-[11px] gap-1 px-2.5 py-0.5 ${
                    savedDailyAudit.status === 'Reconciled'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Audit {savedDailyAudit.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Daily Financial Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>Expected Drawer Cash</span>
                  <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  ₹{dailyMetrics.expectedCash.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  ₹{dailyMetrics.cashSales.toLocaleString()} in − ₹{dailyMetrics.cashExpenses.toLocaleString()} exp
                </p>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>System UPI / QR</span>
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-primary">
                  ₹{dailyMetrics.upiSales.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Online GPay/PhonePe collections</p>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>Pending Dues Added</span>
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  ₹{dailyMetrics.totalPendingToday.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {dailyMetrics.pendingSalesList.length} unpaid bill{dailyMetrics.pendingSalesList.length === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>Day Total Collections</span>
                  <IndianRupee className="h-3.5 w-3.5 text-purple-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-purple-700 dark:text-purple-400">
                  ₹{(dailyMetrics.cashSales + dailyMetrics.upiSales + dailyMetrics.bankSales).toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Total real money received</p>
              </CardContent>
            </Card>
          </div>

          {/* Reconciliation Panels: Cash Drawer & UPI Verification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CASH DRAWER AUDIT */}
            <Card className="border-emerald-200 dark:border-emerald-900/60 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <Banknote className="h-5 w-5" />
                    <CardTitle className="text-base">1. Cash Drawer Audit</CardTitle>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDenominations(!showDenominations)}
                    className="h-7 text-xs text-emerald-700 gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <span>Denomination Counter</span>
                    {showDenominations ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  Count physical currency in the cash box and match against system expected cash.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3">
                {/* Denomination Expandable Section */}
                {showDenominations && (
                  <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
                    <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                      Physical Note Breakdown:
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <Label className="text-[10px]">₹500 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d500}
                          onChange={(e) => setDenominations({ ...denominations, d500: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">₹200 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d200}
                          onChange={(e) => setDenominations({ ...denominations, d200: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">₹100 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d100}
                          onChange={(e) => setDenominations({ ...denominations, d100: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">₹50 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d50}
                          onChange={(e) => setDenominations({ ...denominations, d50: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">₹20 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d20}
                          onChange={(e) => setDenominations({ ...denominations, d20: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">₹10 ×</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.d10}
                          onChange={(e) => setDenominations({ ...denominations, d10: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px]">Coins Total ₹</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={denominations.coins}
                          onChange={(e) => setDenominations({ ...denominations, coins: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-mono font-bold">
                        Counted Sum: ₹{calculatedDenomTotal.toLocaleString()}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyDenominations}
                        className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700"
                      >
                        Apply to Drawer
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">System Expected Cash</Label>
                    <div className="h-9 px-3 flex items-center font-mono font-bold text-base rounded-md border bg-muted/30">
                      ₹{dailyMetrics.expectedCash.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="physical-cash-input" className="text-xs font-semibold">
                      Actual Counted Cash (₹) *
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground">₹</span>
                      <Input
                        id="physical-cash-input"
                        type="number"
                        placeholder="0.00"
                        value={physicalCashInput}
                        onChange={(e) => setPhysicalCashInput(e.target.value)}
                        className="pl-6 h-9 font-mono font-bold text-base"
                      />
                    </div>
                  </div>
                </div>

                {/* Cash Variance Indicator */}
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
                    physicalCashInput === ''
                      ? 'bg-muted/40 border-border text-muted-foreground'
                      : Math.abs(cashVariance) <= 0.01
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                      : cashVariance < 0
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {physicalCashInput === '' ? (
                      <Clock className="h-4 w-4" />
                    ) : Math.abs(cashVariance) <= 0.01 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>
                      {physicalCashInput === ''
                        ? 'Enter physical cash count to check variance'
                        : Math.abs(cashVariance) <= 0.01
                        ? 'Cash Drawer Perfectly Balanced (₹0.00 Variance)'
                        : cashVariance < 0
                        ? `Cash Shortage: Missing ₹${Math.abs(cashVariance).toLocaleString()}`
                        : `Cash Surplus: Excess ₹${cashVariance.toLocaleString()}`}
                    </span>
                  </div>
                  {physicalCashInput !== '' && (
                    <span className="font-mono font-bold text-sm">
                      {cashVariance >= 0 ? `+₹${cashVariance.toLocaleString()}` : `-₹${Math.abs(cashVariance).toLocaleString()}`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* UPI / QR STATEMENT AUDIT */}
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-2 text-primary">
                  <CreditCard className="h-5 w-5" />
                  <CardTitle className="text-base">2. UPI / QR Settlement Audit</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Compare recorded POS UPI sales against PhonePe / GooglePay / Paytm settlement statement.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">System Recorded UPI</Label>
                    <div className="h-9 px-3 flex items-center font-mono font-bold text-base rounded-md border bg-muted/30 text-primary">
                      ₹{dailyMetrics.upiSales.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="actual-upi-input" className="text-xs font-semibold">
                      UPI App Settlement Statement (₹)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground">₹</span>
                      <Input
                        id="actual-upi-input"
                        type="number"
                        placeholder="0.00"
                        value={actualUpiInput}
                        onChange={(e) => setActualUpiInput(e.target.value)}
                        className="pl-6 h-9 font-mono font-bold text-base"
                      />
                    </div>
                  </div>
                </div>

                {/* UPI Variance Indicator */}
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
                    actualUpiInput === ''
                      ? 'bg-muted/40 border-border text-muted-foreground'
                      : Math.abs(upiVariance) <= 0.01
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {actualUpiInput === '' ? (
                      <Clock className="h-4 w-4" />
                    ) : Math.abs(upiVariance) <= 0.01 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <span>
                      {actualUpiInput === ''
                        ? 'Enter bank/scanner app settled sum to verify'
                        : Math.abs(upiVariance) <= 0.01
                        ? 'UPI Settlements Reconciled (₹0.00 Variance)'
                        : `UPI Difference: ₹${Math.abs(upiVariance).toLocaleString()} gap between App & POS`}
                    </span>
                  </div>
                  {actualUpiInput !== '' && (
                    <span className="font-mono font-bold text-sm">
                      {upiVariance >= 0 ? `+₹${upiVariance.toLocaleString()}` : `-₹${Math.abs(upiVariance).toLocaleString()}`}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded border leading-tight">
                  💡 Tip: Verify bank credits at end-of-day. If a customer paid via QR but the bill was not punched, variance will appear positive.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 3. Category: Service Settlements from Daily Invoices */}
          <Card className="border-cyan-200 dark:border-cyan-900/60 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
                  <Wrench className="h-5 w-5" />
                  <CardTitle className="text-base">3. Category: Service Settlements (From Today's Invoices)</CardTitle>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-cyan-700 dark:text-cyan-300 border-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 font-mono text-xs">
                    Total: ₹{dailyMetrics.serviceTotal.toLocaleString()}
                  </Badge>
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 font-mono text-xs">
                    Settled: ₹{dailyMetrics.serviceSettled.toLocaleString()}
                  </Badge>
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300 bg-amber-50 dark:bg-amber-950/40 font-mono text-xs">
                    Pending: ₹{dailyMetrics.servicePending.toLocaleString()}
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-xs">
                Labor, repair, and services extracted from today's customer bills. Track and mark each service as Settled or Pending.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 pt-0 space-y-3">
              {/* Filter controls & Bulk actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Filter:</span>
                  <Button
                    type="button"
                    variant={dailyServiceFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDailyServiceFilter('all')}
                    className="h-7 text-xs px-2.5"
                  >
                    All ({dailyMetrics.serviceItems.length})
                  </Button>
                  <Button
                    type="button"
                    variant={dailyServiceFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDailyServiceFilter('pending')}
                    className="h-7 text-xs px-2.5"
                  >
                    Pending ({dailyMetrics.serviceItems.filter((i) => i.status !== 'Settled').length})
                  </Button>
                  <Button
                    type="button"
                    variant={dailyServiceFilter === 'settled' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDailyServiceFilter('settled')}
                    className="h-7 text-xs px-2.5"
                  >
                    Settled ({dailyMetrics.serviceItems.filter((i) => i.status === 'Settled').length})
                  </Button>
                </div>

                {dailyMetrics.servicePending > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleBulkSetServiceSettlement(dailyMetrics.serviceItems, 'Settled')}
                    className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark All Today as Settled
                  </Button>
                )}
              </div>

              {dailyMetrics.serviceItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
                  <CheckCircle2 className="h-6 w-6 text-muted-foreground/60" />
                  <span>No line items under category "Service" found in invoices for {format(new Date(dailyDate), 'dd-MMM-yyyy')}.</span>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Service / Labor Item</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Settlement Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyMetrics.serviceItems
                        .filter((i) => {
                          if (dailyServiceFilter === 'pending') return i.status !== 'Settled';
                          if (dailyServiceFilter === 'settled') return i.status === 'Settled';
                          return true;
                        })
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono font-bold text-primary">
                              #{item.invoiceNumber}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{item.customerName}</div>
                              {item.customerMobile && (
                                <div className="text-[10px] text-muted-foreground font-mono">{item.customerMobile}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">{item.productName}</div>
                              <span className="text-[10px] text-muted-foreground">Category: {item.category}</span>
                            </TableCell>
                            <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                            <TableCell className="text-right font-mono">₹{item.price.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-foreground">
                              ₹{item.total.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.status === 'Settled' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-medium">
                                  <CheckCircle2 className="h-3 w-3" /> Settled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-medium">
                                  <Clock className="h-3 w-3" /> Pending
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.status === 'Settled' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleServiceSettlement(item)}
                                  className="h-6 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                  title="Click to revert back to Pending"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Mark Pending
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleToggleServiceSettlement(item)}
                                  className="h-6 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <Check className="h-3 w-3" />
                                  Mark Settled
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Dues to Track (Daily) */}
          <Card className="border-amber-200 dark:border-amber-900/60">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Clock className="h-5 w-5" />
                  <CardTitle className="text-base">4. Pending Credit Bills to Track Today</CardTitle>
                </div>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  {dailyMetrics.pendingSalesList.length} Unsettled Bills (₹{dailyMetrics.totalPendingToday.toLocaleString()})
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Invoices billed today that remain Partial or Pending. Follow up before day close so dues don't slip through.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 pt-0">
              {dailyMetrics.pendingSalesList.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <span>No outstanding credit bills created on {format(new Date(dailyDate), 'dd-MMM-yyyy')}. All bills fully paid!</span>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance Due</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyMetrics.pendingSalesList.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-bold text-primary">
                            #{item.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-medium">{item.customerName || 'Walk-in'}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{item.customerMobile || '—'}</TableCell>
                          <TableCell className="text-right font-mono">₹{item.total.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-amber-600">
                            ₹{item.dueAmount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendWhatsAppPendingReminder(item)}
                              className="h-6 text-[11px] gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                            >
                              <MessageCircle className="h-3 w-3" />
                              WhatsApp
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* End of Day Verification Checklist */}
          <Card className="border-border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                5. End-of-Day Checklist & Verification
              </CardTitle>
              <CardDescription className="text-xs">
                Check off daily operational controls to lock the day's records.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                  <Checkbox
                    checked={dailyChecks.cashCounted}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, cashCounted: !!c })}
                  />
                  <span>Physical cash drawer counted and tallied</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                  <Checkbox
                    checked={dailyChecks.upiVerified}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, upiVerified: !!c })}
                  />
                  <span>UPI / QR collections matched with bank statement</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                  <Checkbox
                    checked={dailyChecks.serviceSettled}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, serviceSettled: !!c })}
                  />
                  <span>Category Service / Labor charges reviewed & marked Settled</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                  <Checkbox
                    checked={dailyChecks.expensesLogged}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, expensesLogged: !!c })}
                  />
                  <span>Cash expenses verified with bills/vouchers</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                  <Checkbox
                    checked={dailyChecks.pendingFollowedUp}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, pendingFollowedUp: !!c })}
                  />
                  <span>Unpaid credit customers reminded & followed up</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors md:col-span-2">
                  <Checkbox
                    checked={dailyChecks.drawerClosed}
                    onCheckedChange={(c) => setDailyChecks({ ...dailyChecks, drawerClosed: !!c })}
                  />
                  <span>Workshop day close finalized & drawer locked</span>
                </label>
              </div>

              <div>
                <Label htmlFor="daily-audit-notes" className="text-xs">Daily Notes / Discrepancy Reasons</Label>
                <Textarea
                  id="daily-audit-notes"
                  placeholder="e.g. ₹50 short due to unbilled petrol expense, customer Suresh will clear ₹1,200 balance tomorrow..."
                  value={dailyNotes}
                  onChange={(e) => setDailyNotes(e.target.value)}
                  className="text-xs h-16 mt-1"
                />
              </div>
            </CardContent>

            <CardFooter className="p-4 pt-0 flex justify-end">
              <Button onClick={handleSaveDailyAudit} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Save className="h-4 w-4" />
                Save & Finalize Today's Settlement Audit
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: SERVICE SETTLEMENTS (SEPARATE DAILY / WEEKLY / MONTHLY AUDIT)
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="services" className="space-y-4">
          {/* Controls Bar: Period Scope & Date Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-cyan-600" />
                Settlement View:
              </span>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border">
                <Button
                  type="button"
                  variant={servicesTabPeriod === 'daily' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setServicesTabPeriod('daily')}
                  className="h-7 text-xs px-2.5"
                >
                  Daily
                </Button>
                <Button
                  type="button"
                  variant={servicesTabPeriod === 'weekly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setServicesTabPeriod('weekly')}
                  className="h-7 text-xs px-2.5"
                >
                  Weekly
                </Button>
                <Button
                  type="button"
                  variant={servicesTabPeriod === 'monthly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setServicesTabPeriod('monthly')}
                  className="h-7 text-xs px-2.5"
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  variant={servicesTabPeriod === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setServicesTabPeriod('all')}
                  className="h-7 text-xs px-2.5"
                >
                  All Time
                </Button>
              </div>

              {/* Date Controls per scope */}
              {servicesTabPeriod === 'daily' && (
                <div className="flex items-center gap-1.5 ml-1">
                  <Input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="h-7 text-xs w-32"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDailyDate(format(new Date(), 'yyyy-MM-dd'))}
                    className="h-7 text-xs px-2"
                  >
                    Today
                  </Button>
                </div>
              )}

              {servicesTabPeriod === 'weekly' && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-xs font-medium text-foreground">
                    {format(weekInterval.start, 'dd-MMM')} — {format(weekInterval.end, 'dd-MMM-yyyy')}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWeeklyReferenceDate(subDays(weeklyReferenceDate, 7))}
                    className="h-7 text-xs px-2"
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWeeklyReferenceDate(new Date())}
                    className="h-7 text-xs px-2"
                  >
                    Current
                  </Button>
                </div>
              )}

              {servicesTabPeriod === 'monthly' && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-xs font-medium text-foreground font-semibold">
                    {format(monthlyDate, 'MMMM yyyy')}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMonthlyDate(subDays(startOfMonth(monthlyDate), 5))}
                    className="h-7 text-xs px-2"
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMonthlyDate(new Date())}
                    className="h-7 text-xs px-2"
                  >
                    Current
                  </Button>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendWhatsAppServiceSettlementSummary}
              className="h-7 text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              WhatsApp Settlement Summary
            </Button>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-cyan-200 dark:border-cyan-900/40 bg-gradient-to-br from-cyan-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs text-muted-foreground flex justify-between">
                  <span>Total Service Billed</span>
                  <Wrench className="h-3.5 w-3.5 text-cyan-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-cyan-700 dark:text-cyan-400">
                  ₹{scopedServiceMetrics.total.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{scopedServiceMetrics.items.length} service jobs</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs text-muted-foreground flex justify-between">
                  <span>Settled Amount</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  ₹{scopedServiceMetrics.settled.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{scopedServiceMetrics.settledCount} jobs cleared</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-900/40 bg-gradient-to-br from-amber-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs text-muted-foreground flex justify-between">
                  <span>Pending to Settle</span>
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  ₹{scopedServiceMetrics.pending.toLocaleString()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{scopedServiceMetrics.pendingCount} jobs unsettled</p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 dark:border-purple-900/40 bg-gradient-to-br from-purple-500/10 via-card to-card">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs text-muted-foreground flex justify-between">
                  <span>Settlement Progress</span>
                  <Percent className="h-3.5 w-3.5 text-purple-600" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg md:text-xl font-bold font-mono text-purple-700 dark:text-purple-400">
                  {scopedServiceMetrics.rate}%
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {scopedServiceMetrics.pendingCount === 0 ? '100% Fully Settled' : `${scopedServiceMetrics.pendingCount} pending payout`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search, Status Filter & Table Card */}
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>Service Item Records</span>
                    <Badge variant="outline" className="text-xs">
                      {displayedServiceItems.length} found
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Invoices containing labor, repairs, washing, or custom service jobs. Mark individual jobs as Settled or Pending.
                  </CardDescription>
                </div>

                {scopedServiceMetrics.pendingCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleBulkSetServiceSettlement(displayedServiceItems, 'Settled')}
                    className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white self-start sm:self-auto"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark All Filtered as Settled
                  </Button>
                )}
              </div>

              {/* Search & Filter pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t">
                <div className="relative w-full sm:w-72">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by customer, invoice #, service..."
                    value={servicesTabSearch}
                    onChange={(e) => setServicesTabSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Button
                    type="button"
                    variant={servicesTabFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServicesTabFilter('all')}
                    className="h-7 text-xs px-2.5"
                  >
                    All ({scopedServiceMetrics.items.length})
                  </Button>
                  <Button
                    type="button"
                    variant={servicesTabFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServicesTabFilter('pending')}
                    className="h-7 text-xs px-2.5 text-amber-700 border-amber-300"
                  >
                    Pending ({scopedServiceMetrics.pendingCount})
                  </Button>
                  <Button
                    type="button"
                    variant={servicesTabFilter === 'settled' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServicesTabFilter('settled')}
                    className="h-7 text-xs px-2.5 text-emerald-700 border-emerald-300"
                  >
                    Settled ({scopedServiceMetrics.settledCount})
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-0">
              {displayedServiceItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                  <Wrench className="h-7 w-7 text-muted-foreground/60" />
                  <span className="font-semibold text-foreground">No matching service items found</span>
                  <span>Try clearing your search query or selecting a different period scope.</span>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Service Description</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Rate (₹)</TableHead>
                        <TableHead className="text-right">Total (₹)</TableHead>
                        <TableHead className="text-center">Mode</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Settlement Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedServiceItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-bold text-primary">
                            #{item.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {format(new Date(item.date), 'dd-MMM-yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{item.customerName}</div>
                            {item.customerMobile && (
                              <div className="text-[10px] text-muted-foreground font-mono">{item.customerMobile}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{item.productName}</div>
                            <span className="text-[10px] text-muted-foreground">Category: {item.category}</span>
                          </TableCell>
                          <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono">₹{item.price.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            ₹{item.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {item.paymentMode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {item.status === 'Settled' ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-medium">
                                <CheckCircle2 className="h-3 w-3" /> Settled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-medium">
                                <Clock className="h-3 w-3" /> Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.status === 'Settled' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleServiceSettlement(item)}
                                className="h-6 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                title="Click to revert back to Pending"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Mark Pending
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleToggleServiceSettlement(item)}
                                className="h-6 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="h-3 w-3" />
                                Mark Settled
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: WEEKLY AUDIT & LACKING ANALYSIS
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="weekly" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-600" />
              <span className="text-xs font-semibold">
                Audit Week: {format(weekInterval.start, 'dd-MMM')} — {format(weekInterval.end, 'dd-MMM-yyyy')}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeeklyReferenceDate(subDays(weeklyReferenceDate, 7))}
                className="h-7 text-xs"
              >
                Previous Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeeklyReferenceDate(new Date())}
                className="h-7 text-xs"
              >
                Current Week
              </Button>
            </div>
          </div>

          {weeklyMetrics && (
            <>
              {/* Weekly Financial KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-indigo-200 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-500/10 via-card to-card">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Total Billed</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
                      ₹{weeklyMetrics.totalBilled.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{weeklyMetrics.count} invoices</p>
                  </CardContent>
                </Card>

                <Card className="border-emerald-200 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-500/10 via-card to-card">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Real Money Collected</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      ₹{weeklyMetrics.totalCollected.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Cash ₹{weeklyMetrics.cashCollected.toLocaleString()} | UPI ₹{weeklyMetrics.upiCollected.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-amber-200 dark:border-amber-900/40 bg-gradient-to-br from-amber-500/10 via-card to-card">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Pending Credit Added</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-amber-600">
                      ₹{weeklyMetrics.pendingUnpaid.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Uncollected this week</p>
                  </CardContent>
                </Card>

                <Card className="border-purple-200 dark:border-purple-900/40 bg-gradient-to-br from-purple-500/10 via-card to-card">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Net Cash Flow</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-purple-700 dark:text-purple-400">
                      ₹{weeklyMetrics.netCashFlow.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Collected − ₹{weeklyMetrics.weekExpenses.toLocaleString()} expenses
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Category: Service Settlements (Weekly Overview) */}
              <Card className="border-cyan-200 dark:border-cyan-900/40 bg-gradient-to-br from-cyan-500/10 via-card to-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-cyan-800 dark:text-cyan-300">
                      <Wrench className="h-5 w-5 text-cyan-600" />
                      <CardTitle className="text-base">Weekly Category: Service Settlements</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-cyan-700 dark:text-cyan-300 border-cyan-300 font-mono text-xs">
                        Total: ₹{weeklyMetrics.serviceTotal.toLocaleString()}
                      </Badge>
                      <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 font-mono text-xs">
                        Settled: ₹{weeklyMetrics.serviceSettled.toLocaleString()}
                      </Badge>
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300 font-mono text-xs">
                        Pending: ₹{weeklyMetrics.servicePending.toLocaleString()}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowWeeklyServices(!showWeeklyServices)}
                        className="h-7 text-xs gap-1"
                      >
                        <span>{showWeeklyServices ? 'Hide Services' : 'View Services'}</span>
                        {showWeeklyServices ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    Weekly labor & service income summary. Review and settle individual service jobs.
                  </CardDescription>
                </CardHeader>
                {showWeeklyServices && (
                  <CardContent className="p-4 pt-1 space-y-3">
                    {weeklyMetrics.serviceItems.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No service category items billed this week.
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-x-auto">
                        <Table className="text-xs">
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Service Item</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-center">Settlement Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {weeklyMetrics.serviceItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono font-bold text-primary">#{item.invoiceNumber}</TableCell>
                                <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(item.date), 'dd-MMM')}</TableCell>
                                <TableCell className="font-medium">{item.customerName}</TableCell>
                                <TableCell>{item.productName}</TableCell>
                                <TableCell className="text-right font-mono font-bold">₹{item.total.toLocaleString()}</TableCell>
                                <TableCell className="text-center">
                                  {item.status === 'Settled' ? (
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px] gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> Settled
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px] gap-1">
                                      <Clock className="h-3 w-3" /> Pending
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {item.status === 'Settled' ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleToggleServiceSettlement(item)}
                                      className="h-6 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                    >
                                      <RotateCcw className="h-3 w-3" /> Mark Pending
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleToggleServiceSettlement(item)}
                                      className="h-6 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Check className="h-3 w-3" /> Mark Settled
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* WHERE ARE WE LACKING? (Actionable Diagnosis) */}
              <Card className="border-indigo-300 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/50 via-card to-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                    <CardTitle className="text-base">Where Are We Lacking? (Weekly Gap Analysis)</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Identifies areas where cash or operational efficiency is lagging this week.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-card space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Collection Efficiency:</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold font-mono text-foreground">{weeklyMetrics.collectionRate}%</span>
                        <Badge
                          variant="outline"
                          className={weeklyMetrics.collectionRate >= 80 ? 'text-emerald-700 border-emerald-300' : 'text-amber-700 border-amber-300'}
                        >
                          {weeklyMetrics.collectionRate >= 80 ? 'Healthy' : 'Needs Follow-up'}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {weeklyMetrics.collectionRate < 80
                          ? `⚠️ ${100 - weeklyMetrics.collectionRate}% of revenue is stuck in customer credit.`
                          : 'Good collection pace. Minimum credit lag.'}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border bg-card space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Expense vs Revenue Ratio:</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold font-mono text-foreground">
                          {weeklyMetrics.totalCollected > 0
                            ? Math.round((weeklyMetrics.weekExpenses / weeklyMetrics.totalCollected) * 100)
                            : 0}
                          %
                        </span>
                        <Badge variant="outline" className="text-purple-700 border-purple-300">Operational</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Shop operating expense total: ₹{weeklyMetrics.weekExpenses.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border bg-card space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Unpaid Credit Risk:</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold font-mono text-amber-600">
                          ₹{weeklyMetrics.pendingUnpaid.toLocaleString()}
                        </span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300">Credit Lag</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Follow up with top customers before giving new parts on credit.
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="weekly-lacking-notes" className="text-xs font-semibold">
                      Weekly Corrective Action Plan:
                    </Label>
                    <Textarea
                      id="weekly-lacking-notes"
                      placeholder="e.g. Need to reduce spare part purchase delay, 3 high credit customers must clear dues before Friday, mechanic Raju commission verified..."
                      value={weeklyLackingNotes}
                      onChange={(e) => setWeeklyLackingNotes(e.target.value)}
                      className="text-xs h-16 mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: MONTHLY SETTLEMENT & PROFIT AUDIT
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="monthly" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-semibold">
                Month: {format(monthlyDate, 'MMMM yyyy')}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonthlyDate(subDays(startOfMonth(monthlyDate), 5))}
                className="h-7 text-xs"
              >
                Previous Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonthlyDate(new Date())}
                className="h-7 text-xs"
              >
                Current Month
              </Button>
            </div>
          </div>

          {monthlyMetrics && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Gross Sales Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-foreground">
                      ₹{monthlyMetrics.totalRevenue.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{monthlyMetrics.salesCount} invoices</p>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Purchases / Inventory Cost</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-muted-foreground">
                      ₹{monthlyMetrics.mPurchases.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Supplier invoices</p>
                  </CardContent>
                </Card>

                <Card className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/20">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold">
                      Estimated Operating Margin
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
                      ₹{monthlyMetrics.netOperatingProfit.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Revenue − Purchases − Expenses</p>
                  </CardContent>
                </Card>

                <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/20">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs text-amber-800 dark:text-amber-400 font-semibold">
                      Total Shop Customer Debt
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-lg md:text-xl font-bold font-mono text-amber-600">
                      ₹{monthlyMetrics.totalShopReceivables.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Cumulative outstanding credit</p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Service Settlements Card */}
              <Card className="border-cyan-200 dark:border-cyan-900 bg-gradient-to-br from-cyan-50/40 via-card to-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-cyan-800 dark:text-cyan-300">
                      <Wrench className="h-5 w-5 text-cyan-600" />
                      <CardTitle className="text-base">Monthly Category: Service Settlements</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-cyan-700 dark:text-cyan-300 border-cyan-300 font-mono text-xs">
                        Total: ₹{monthlyMetrics.serviceTotal.toLocaleString()}
                      </Badge>
                      <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 font-mono text-xs">
                        Settled: ₹{monthlyMetrics.serviceSettled.toLocaleString()}
                      </Badge>
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300 font-mono text-xs">
                        Pending: ₹{monthlyMetrics.servicePending.toLocaleString()}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMonthlyServices(!showMonthlyServices)}
                        className="h-7 text-xs gap-1"
                      >
                        <span>{showMonthlyServices ? 'Hide Services' : 'View Services'}</span>
                        {showMonthlyServices ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    Monthly labor & service income summary. Review and settle individual service jobs across this month.
                  </CardDescription>
                </CardHeader>
                {showMonthlyServices && (
                  <CardContent className="p-4 pt-1 space-y-3">
                    {monthlyMetrics.serviceItems.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No service category items billed this month.
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-x-auto">
                        <Table className="text-xs">
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Service Item</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-center">Settlement Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlyMetrics.serviceItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono font-bold text-primary">#{item.invoiceNumber}</TableCell>
                                <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(item.date), 'dd-MMM')}</TableCell>
                                <TableCell className="font-medium">{item.customerName}</TableCell>
                                <TableCell>{item.productName}</TableCell>
                                <TableCell className="text-right font-mono font-bold">₹{item.total.toLocaleString()}</TableCell>
                                <TableCell className="text-center">
                                  {item.status === 'Settled' ? (
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px] gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> Settled
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px] gap-1">
                                      <Clock className="h-3 w-3" /> Pending
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {item.status === 'Settled' ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleToggleServiceSettlement(item)}
                                      className="h-6 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                    >
                                      <RotateCcw className="h-3 w-3" /> Mark Pending
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleToggleServiceSettlement(item)}
                                      className="h-6 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Check className="h-3 w-3" /> Mark Settled
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Monthly Checklist Card */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-purple-600" />
                    Month-End Verification Controls
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Monthly financial checkpoints to close the books cleanly.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-2.5 text-xs">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={monthlyChecks.bankReconciled}
                      onCheckedChange={(c) => setMonthlyChecks({ ...monthlyChecks, bankReconciled: !!c })}
                    />
                    <span>Bank account & UPI monthly statement reconciled</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={monthlyChecks.vendorBalancesTallied}
                      onCheckedChange={(c) => setMonthlyChecks({ ...monthlyChecks, vendorBalancesTallied: !!c })}
                    />
                    <span>Vendor & spare part supplier balances confirmed</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={monthlyChecks.inventoryCountVerified}
                      onCheckedChange={(c) => setMonthlyChecks({ ...monthlyChecks, inventoryCountVerified: !!c })}
                    />
                    <span>Physical workshop spare part stock audit done</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={monthlyChecks.taxReportReviewed}
                      onCheckedChange={(c) => setMonthlyChecks({ ...monthlyChecks, taxReportReviewed: !!c })}
                    />
                    <span>GST tax report generated and validated for filing</span>
                  </label>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4: MECHANIC COMMISSION CALCULATOR
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="commission" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* CALCULATOR CARD (Left 2 cols) */}
            <Card className="lg:col-span-2 border-amber-200 dark:border-amber-900/60 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Wrench className="h-5 w-5" />
                    <CardTitle className="text-base">Mechanic Commission Calculator</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">
                    Default 5% Commission
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Calculate and log commissions for mechanics on vehicle repairs and spare parts jobs.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-4">
                {/* 1. Mechanic Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Select Workshop Mechanic *</Label>
                    <Select value={selectedMechanic} onValueChange={setSelectedMechanic}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose mechanic from staff..." />
                      </SelectTrigger>
                      <SelectContent>
                        {rawEmployees?.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.name} ({emp.designation || 'Technician'})
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">+ Custom / External Mechanic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedMechanic === 'custom' ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Mechanic Name *</Label>
                      <Input
                        placeholder="e.g. Ramesh"
                        value={customMechanicName}
                        onChange={(e) => setCustomMechanicName(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs">Mechanic Phone (for WhatsApp slip)</Label>
                      <Input
                        placeholder="e.g. 9876543210"
                        value={mechanicPhone}
                        onChange={(e) => setMechanicPhone(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Optional: Link to Existing Invoice */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Link with Invoice (Optional)</Label>
                  <Select value={selectedInvoiceId} onValueChange={handleSelectInvoice}>
                    <SelectTrigger className="h-8 text-xs font-mono">
                      <SelectValue placeholder="Select invoice to auto-load bill amount..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Manual Amount)</SelectItem>
                      {rawSales?.slice(0, 20).map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          #{inv.invoiceNumber} — ₹{inv.total.toLocaleString()} ({inv.customerName || 'Walk-in'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Bill Amount & Commission Rate */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="bill-amount-input" className="text-xs font-semibold">
                      Job / Bill Amount (₹) *
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground">₹</span>
                      <Input
                        id="bill-amount-input"
                        type="number"
                        placeholder="0.00"
                        value={billAmountInput}
                        onChange={(e) => setBillAmountInput(e.target.value)}
                        className="pl-6 h-9 font-mono font-bold text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="commission-rate-input" className="text-xs font-semibold">
                        Commission Rate (%)
                      </Label>
                      <div className="flex gap-1">
                        {[3, 5, 7.5, 10].map((rate) => (
                          <Button
                            key={rate}
                            type="button"
                            variant={commissionRate === rate ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCommissionRate(rate)}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {rate}%
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <span className="absolute right-2.5 top-2 text-xs font-bold text-muted-foreground">%</span>
                      <Input
                        id="commission-rate-input"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
                        className="pr-6 h-9 font-mono font-bold text-base"
                      />
                    </div>
                  </div>
                </div>

                {/* Bonus & Advance Deductions */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="bonus-input" className="text-xs">Bonus / Labor Tip (₹)</Label>
                    <Input
                      id="bonus-input"
                      type="number"
                      placeholder="0.00"
                      value={bonusInput}
                      onChange={(e) => setBonusInput(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="deductions-input" className="text-xs">Advance / Parts Deduction (₹)</Label>
                    <Input
                      id="deductions-input"
                      type="number"
                      placeholder="0.00"
                      value={deductionsInput}
                      onChange={(e) => setDeductionsInput(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Payment Mode & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Payout Mode</Label>
                    <Select
                      value={commissionPaymentMode}
                      onValueChange={(v: 'Cash' | 'UPI') => setCommissionPaymentMode(v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash Payout</SelectItem>
                        <SelectItem value="UPI">UPI / GPay Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="comm-note" className="text-xs">Payout Note</Label>
                    <Input
                      id="comm-note"
                      placeholder="e.g. Brake pad repair job, clutch fitting"
                      value={commissionNotes}
                      onChange={(e) => setCommissionNotes(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Live Payout Breakdown Card */}
                <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-50/70 via-card to-card space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Base Commission ({commissionRate}% on ₹{billAmount.toLocaleString()}):</span>
                    <span className="font-mono font-semibold text-foreground">₹{baseCommission.toLocaleString()}</span>
                  </div>
                  {bonus > 0 && (
                    <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                      <span>Extra Bonus / Tip:</span>
                      <span className="font-mono font-semibold">+₹{bonus.toLocaleString()}</span>
                    </div>
                  )}
                  {deductions > 0 && (
                    <div className="flex justify-between text-xs text-red-600">
                      <span>Advance Deducted:</span>
                      <span className="font-mono font-semibold">−₹{deductions.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-amber-300 dark:border-amber-800/80 pt-2 flex justify-between items-center">
                    <span className="text-sm font-bold text-foreground">Net Payable to Mechanic:</span>
                    <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
                      ₹{netCommissionPayable.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendWhatsAppCommissionSlip}
                    disabled={billAmount <= 0}
                    className="gap-1.5 text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Send WhatsApp Voucher
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRecordCommission}
                    disabled={isSavingCommission || billAmount <= 0}
                    className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Record & Pay Commission
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* MONTHLY COMMISSION TOTALS & SUMMARY (Right 1 col) */}
            <div className="space-y-4">
              <Card className="border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 via-card to-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs text-muted-foreground flex justify-between">
                    <span>Month Commissions Paid</span>
                    <Wrench className="h-4 w-4 text-amber-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
                    ₹{totalCommissionsMonth.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Total mechanic incentives disbursed in {format(new Date(), 'MMMM yyyy')}.
                  </p>
                </CardContent>
              </Card>

              {/* Commission History List */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-semibold">Recent Commission Payouts</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {rawCommissions?.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No commissions recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {rawCommissions?.slice(0, 10).map((comm) => (
                        <div key={comm.id} className="p-2.5 rounded-lg border text-xs space-y-1">
                          <div className="flex justify-between font-semibold">
                            <span>{comm.mechanicName}</span>
                            <span className="font-mono text-amber-600">₹{comm.netPayable.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>{comm.commissionRate}% on ₹{comm.billAmount.toLocaleString()}</span>
                            <span>{comm.paymentMode}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-0.5">
                            <span>{format(new Date(comm.date), 'dd-MMM-yyyy')}</span>
                            {comm.invoiceNumber && <span>Inv #{comm.invoiceNumber}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
