'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DatePicker } from '@/components/ui/date-picker';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Sale, Expense, Purchase, CompanyProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  IndianRupee,
  Share2,
  Copy,
  Check,
  Calendar as CalendarIcon,
  Building2,
  CheckCircle2,
  Sparkles,
  Smartphone,
  RefreshCw,
  Send,
  Save,
  MessageCircle,
} from 'lucide-react';

type PeriodMode = 'weekly' | 'daily' | 'custom';
type MessageFormatStyle = 'standard' | 'detailed' | 'compact';

function parseDateSafe(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function WhatsappShareManagement() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  // Queries
  const salesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sales') : null),
    [firestore]
  );
  const expensesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'expenses') : null),
    [firestore]
  );
  const purchasesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'purchases') : null),
    [firestore]
  );
  const profilesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'companyProfiles') : null),
    [firestore]
  );

  const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesQuery);
  const { data: expenses, isLoading: expensesLoading } = useCollection<Expense>(expensesQuery);
  const { data: purchases, isLoading: purchasesLoading } = useCollection<Purchase>(purchasesQuery);
  const { data: profiles } = useCollection<CompanyProfile>(profilesQuery);

  const defaultProfile = useMemo(() => {
    return profiles?.find((p) => p.isDefault) || profiles?.[0] || null;
  }, [profiles]);

  // Mode & Selection State
  const [periodMode, setPeriodMode] = useState<PeriodMode>('weekly');

  const today = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth()); // 0-indexed

  // Determine current week of month (1 to 5)
  const defaultWeekNumber = useMemo(() => {
    const day = today.getDate();
    if (day <= 7) return '1';
    if (day <= 14) return '2';
    if (day <= 21) return '3';
    if (day <= 28) return '4';
    return '5';
  }, [today]);

  const [selectedWeek, setSelectedWeek] = useState<string>(defaultWeekNumber);

  // Daily Mode State
  const [singleDate, setSingleDate] = useState<Date>(today);

  // Custom Range State
  const [customStartDate, setCustomStartDate] = useState<Date>(today);
  const [customEndDate, setCustomEndDate] = useState<Date>(today);

  // Sharing & Recipient Settings
  const [ownerPhone, setOwnerPhone] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [formatStyle, setFormatStyle] = useState<MessageFormatStyle>('standard');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [cashInHand, setCashInHand] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSavedPhone, setIsSavedPhone] = useState(false);
  const [customMessageOverride, setCustomMessageOverride] = useState<string | null>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // Load defaults from local storage or company profile
  useEffect(() => {
    const savedPhone = localStorage.getItem('shop_owner_whatsapp_phone');
    if (savedPhone) {
      setOwnerPhone(savedPhone);
      setIsSavedPhone(true);
    } else if (defaultProfile?.contact) {
      setOwnerPhone(defaultProfile.contact);
    }

    if (defaultProfile?.companyName && !storeName) {
      setStoreName(defaultProfile.companyName);
    }

    const currentUserName = user?.displayName || user?.email?.split('@')[0] || '';
    if (currentUserName && !senderName) {
      setSenderName(currentUserName);
    }
  }, [defaultProfile, user, storeName, senderName]);

  const handleSavePhone = () => {
    localStorage.setItem('shop_owner_whatsapp_phone', ownerPhone.trim());
    setIsSavedPhone(true);
    toast({
      title: 'Owner Phone Saved',
      description: 'Default WhatsApp recipient number has been saved.',
    });
  };

  // Compute Active Date Range
  const { startDate, endDate, weekLabel, searchTag } = useMemo(() => {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const fullMonthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    if (periodMode === 'daily') {
      const start = new Date(singleDate.getFullYear(), singleDate.getMonth(), singleDate.getDate(), 0, 0, 0, 0);
      const end = new Date(singleDate.getFullYear(), singleDate.getMonth(), singleDate.getDate(), 23, 59, 59, 999);
      const label = `Daily (${format(singleDate, 'dd-MMM-yyyy')})`;
      const tag = `#DailyCashFlow_${format(singleDate, 'ddMMMyyyy')}`;
      return { startDate: start, endDate: end, weekLabel: label, searchTag: tag };
    }

    if (periodMode === 'custom') {
      const start = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), customStartDate.getDate(), 0, 0, 0, 0);
      const end = new Date(customEndDate.getFullYear(), customEndDate.getMonth(), customEndDate.getDate(), 23, 59, 59, 999);
      const label = `${format(start, 'dd-MMM-yyyy')} to ${format(end, 'dd-MMM-yyyy')}`;
      const tag = `#CashFlow_${format(start, 'ddMMM')}_to_${format(end, 'ddMMM')}`;
      return { startDate: start, endDate: end, weekLabel: label, searchTag: tag };
    }

    // Weekly Mode
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    let startDay = 1;
    let endDay = 7;
    let ord = '1st Week';
    let shortTag = '1stWeek';

    if (selectedWeek === '1') {
      startDay = 1;
      endDay = 7;
      ord = '1st Week';
      shortTag = '1stWeek';
    } else if (selectedWeek === '2') {
      startDay = 8;
      endDay = 14;
      ord = '2nd Week';
      shortTag = '2ndWeek';
    } else if (selectedWeek === '3') {
      startDay = 15;
      endDay = 21;
      ord = '3rd Week';
      shortTag = '3rdWeek';
    } else if (selectedWeek === '4') {
      startDay = 22;
      endDay = Math.min(28, daysInMonth);
      ord = '4th Week';
      shortTag = '4thWeek';
    } else if (selectedWeek === '5') {
      startDay = 29;
      endDay = daysInMonth;
      ord = '5th Week';
      shortTag = '5thWeek';
    } else if (selectedWeek === 'full') {
      startDay = 1;
      endDay = daysInMonth;
      ord = 'Full Month';
      shortTag = 'FullMonth';
    }

    const start = new Date(selectedYear, selectedMonth, startDay, 0, 0, 0, 0);
    const end = new Date(selectedYear, selectedMonth, endDay, 23, 59, 59, 999);
    const mthShort = monthNames[selectedMonth];
    const mthFull = fullMonthNames[selectedMonth];
    const label = `${ord} - ${mthShort} ${selectedYear}`;
    const tag = `#${shortTag}_${mthShort}${selectedYear}`;

    return {
      startDate: start,
      endDate: end,
      weekLabel: label,
      searchTag: tag,
    };
  }, [periodMode, singleDate, customStartDate, customEndDate, selectedYear, selectedMonth, selectedWeek]);

  // Aggregate Data for Period
  const {
    filteredSales,
    totalSalesInvoiced,
    totalReceived,
    creditSalesDue,
    filteredExpenses,
    totalExpenses,
    filteredPurchases,
    totalPurchasesInvoiced,
    totalBillPaid,
    pendingPurchasesDue,
    netProfit,
  } = useMemo(() => {
    // 1. Sales
    const fSales = (sales || []).filter((s) => {
      const d = parseDateSafe(s.date);
      return d && d >= startDate && d <= endDate;
    });

    const invoiced = fSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const received = fSales.reduce((sum, s) => {
      if (s.amountPaid !== undefined && s.amountPaid !== null) {
        return sum + (Number(s.amountPaid) || 0);
      }
      if (s.paymentStatus === 'Paid') {
        return sum + (Number(s.total) || 0);
      }
      return sum;
    }, 0);
    const credit = Math.max(0, invoiced - received);

    // 2. Expenses
    const fExpenses = (expenses || []).filter((e) => {
      const d = parseDateSafe(e.date);
      return d && d >= startDate && d <= endDate;
    });
    const expTotal = fExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // 3. Purchases (Bill Paid)
    const fPurchases = (purchases || []).filter((p) => {
      const d = parseDateSafe(p.date);
      return d && d >= startDate && d <= endDate;
    });
    const purchaseInvoiced = fPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
    const billPaid = fPurchases.reduce((sum, p) => {
      if (p.amountPaid !== undefined && p.amountPaid !== null) {
        return sum + (Number(p.amountPaid) || 0);
      }
      if (p.paymentStatus === 'Paid') {
        return sum + (Number(p.totalAmount) || 0);
      }
      return sum;
    }, 0);
    const purchasePending = Math.max(0, purchaseInvoiced - billPaid);

    // 4. Formula: received - Expenses - Bill Paid = Profit
    const profit = Math.round((received - expTotal - billPaid) * 100) / 100;

    return {
      filteredSales: fSales,
      totalSalesInvoiced: Math.round(invoiced * 100) / 100,
      totalReceived: Math.round(received * 100) / 100,
      creditSalesDue: Math.round(credit * 100) / 100,
      filteredExpenses: fExpenses,
      totalExpenses: Math.round(expTotal * 100) / 100,
      filteredPurchases: fPurchases,
      totalPurchasesInvoiced: Math.round(purchaseInvoiced * 100) / 100,
      totalBillPaid: Math.round(billPaid * 100) / 100,
      pendingPurchasesDue: Math.round(purchasePending * 100) / 100,
      netProfit: profit,
    };
  }, [sales, expenses, purchases, startDate, endDate]);

  // Construct WhatsApp Standard Message
  const generatedWhatsappText = useMemo(() => {
    const businessTitle = storeName.trim() || 'Spark Automotive';
    const reporter = senderName.trim() ? `👤 *From:* ${senderName.trim()}\n` : '';
    const dateSpan = `${format(startDate, 'dd-MMM-yyyy')} to ${format(endDate, 'dd-MMM-yyyy')}`;
    const profitEmoji = netProfit >= 0 ? '🟢' : '🔴';
    const profitLabel = netProfit >= 0 ? 'NET PROFIT / CASH BALANCE' : 'NET DEFICIT';

    if (formatStyle === 'compact') {
      let msg = `📊 *${weekLabel} Cash Flow*\n`;
      msg += `📅 ${dateSpan}\n`;
      msg += `🏢 *${businessTitle}*\n`;
      if (reporter) msg += reporter;
      msg += `\n`;
      msg += `➕ Received: ₹${formatCurrency(totalReceived)}\n`;
      msg += `➖ Expenses: ₹${formatCurrency(totalExpenses)}\n`;
      msg += `➖ Bill Paid: ₹${formatCurrency(totalBillPaid)}\n`;
      msg += `────────────────────\n`;
      msg += `${profitEmoji} *Profit: ₹${formatCurrency(netProfit)}*\n`;
      if (cashInHand.trim()) {
        msg += `💵 Cash in Box: ₹${cashInHand.trim()}\n`;
      }
      if (closingNotes.trim()) {
        msg += `📝 Note: ${closingNotes.trim()}\n`;
      }
      msg += `\n${searchTag} #CashFlow`;
      return msg;
    }

    if (formatStyle === 'detailed') {
      let msg = `📊 *WEEKLY CASH FLOW REPORT*\n`;
      msg += `📅 *Period:* ${weekLabel} (${dateSpan})\n`;
      msg += `🏢 *Store:* ${businessTitle}\n`;
      if (reporter) msg += reporter;
      msg += `\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💰 *CASH FLOW FORMULA*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `➕ *Received (Sales):* ₹${formatCurrency(totalReceived)}\n`;
      msg += `➖ *Expenses (Shop):* ₹${formatCurrency(totalExpenses)}\n`;
      msg += `➖ *Bill Paid (Purchases):* ₹${formatCurrency(totalBillPaid)}\n`;
      msg += `────────────────────\n`;
      msg += `${profitEmoji} *${profitLabel}:* ₹${formatCurrency(netProfit)}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      msg += `📋 *SALES BREAKDOWN*\n`;
      msg += `• Invoices Created: ${filteredSales.length} bills\n`;
      msg += `• Billed Value: ₹${formatCurrency(totalSalesInvoiced)}\n`;
      msg += `• Cash/UPI Received: ₹${formatCurrency(totalReceived)}\n`;
      if (creditSalesDue > 0) {
        msg += `• Pending Collection: ₹${formatCurrency(creditSalesDue)}\n`;
      }
      msg += `\n`;

      if (filteredExpenses.length > 0) {
        msg += `🧾 *EXPENSES LOGGED (${filteredExpenses.length})*\n`;
        filteredExpenses.slice(0, 10).forEach((e) => {
          msg += `• ${e.expenseType || 'Expense'}: ₹${formatCurrency(e.amount)}\n`;
        });
        if (filteredExpenses.length > 10) {
          msg += `• ...and ${filteredExpenses.length - 10} more expenses\n`;
        }
        msg += `*Total Expenses:* ₹${formatCurrency(totalExpenses)}\n\n`;
      } else {
        msg += `🧾 *Expenses Logged:* Nil (₹0.00)\n\n`;
      }

      if (filteredPurchases.length > 0) {
        msg += `📦 *PURCHASE BILLS PAID (${filteredPurchases.length})*\n`;
        filteredPurchases.slice(0, 8).forEach((p) => {
          const paid = p.amountPaid ?? (p.paymentStatus === 'Paid' ? p.totalAmount : 0);
          msg += `• ${p.supplierName} (${p.invoiceNo}): ₹${formatCurrency(paid)}\n`;
        });
        if (filteredPurchases.length > 8) {
          msg += `• ...and ${filteredPurchases.length - 8} more bills\n`;
        }
        msg += `*Total Bill Paid:* ₹${formatCurrency(totalBillPaid)}\n\n`;
      } else {
        msg += `📦 *Purchase Bills Paid:* Nil (₹0.00)\n\n`;
      }

      if (cashInHand.trim()) {
        msg += `💵 *Closing Cash in Hand:* ₹${cashInHand.trim()}\n`;
      }
      if (closingNotes.trim()) {
        msg += `📝 *Shopkeeper Remarks:*\n${closingNotes.trim()}\n`;
      }

      msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `_Search in WhatsApp: ${searchTag} #WeeklyCashFlow_\n`;
      msg += `_Generated on ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}_`;
      return msg;
    }

    // Default: Standard Cash Flow
    let msg = `📊 *WEEKLY CASH FLOW REPORT*\n`;
    msg += `📅 *Period:* ${weekLabel} (${dateSpan})\n`;
    msg += `🏢 *Store:* ${businessTitle}\n`;
    if (reporter) msg += reporter;
    msg += `\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *CASH FLOW SUMMARY*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `➕ *Received (Sales Collection):* ₹${formatCurrency(totalReceived)}\n`;
    msg += `➖ *Expenses (Shop Operations):* ₹${formatCurrency(totalExpenses)}\n`;
    msg += `➖ *Bill Paid (Purchases):* ₹${formatCurrency(totalBillPaid)}\n`;
    msg += `────────────────────\n`;
    msg += `${profitEmoji} *${profitLabel}:* ₹${formatCurrency(netProfit)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `📝 *QUICK BREAKDOWN*\n`;
    msg += `• Sales Bills: ${filteredSales.length} (${totalSalesInvoiced > totalReceived ? `Billed ₹${formatCurrency(totalSalesInvoiced)} | ` : ''}Collected ₹${formatCurrency(totalReceived)})\n`;
    msg += `• Expenses: ${filteredExpenses.length} entries (₹${formatCurrency(totalExpenses)})\n`;
    msg += `• Purchase Bills Paid: ${filteredPurchases.length} bills (₹${formatCurrency(totalBillPaid)})\n`;

    if (creditSalesDue > 0) {
      msg += `• Customer Dues to Collect: ₹${formatCurrency(creditSalesDue)}\n`;
    }
    if (pendingPurchasesDue > 0) {
      msg += `• Supplier Unpaid Balances: ₹${formatCurrency(pendingPurchasesDue)}\n`;
    }

    if (cashInHand.trim()) {
      msg += `\n💵 *Counter Cash in Hand:* ₹${cashInHand.trim()}\n`;
    }
    if (closingNotes.trim()) {
      msg += `\n📝 *Notes:* ${closingNotes.trim()}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Search tag: ${searchTag} #WeeklyCashFlow_\n`;
    msg += `_Generated via Spark Billing on ${format(new Date(), 'dd-MMM-yyyy')}_`;

    return msg;
  }, [
    formatStyle,
    weekLabel,
    startDate,
    endDate,
    storeName,
    senderName,
    netProfit,
    totalReceived,
    totalExpenses,
    totalBillPaid,
    filteredSales,
    totalSalesInvoiced,
    creditSalesDue,
    filteredExpenses,
    filteredPurchases,
    pendingPurchasesDue,
    cashInHand,
    closingNotes,
    searchTag,
  ]);

  const finalMessage = customMessageOverride !== null ? customMessageOverride : generatedWhatsappText;

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(finalMessage);
    setIsCopied(true);
    toast({
      title: 'Copied to Clipboard',
      description: 'Cash flow summary ready to paste into WhatsApp.',
    });
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const cleanNumber = ownerPhone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(finalMessage);

    let url = '';
    if (cleanNumber.length >= 10) {
      const formatted = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
      url = `https://wa.me/${formatted}?text=${encoded}`;
    } else {
      url = `https://wa.me/?text=${encoded}`;
    }

    window.open(url, '_blank');
  };

  const monthOptions = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' },
  ];

  const yearOptions = [
    today.getFullYear() - 1,
    today.getFullYear(),
    today.getFullYear() + 1,
  ];

  return (
    <div className="space-y-6">
      {/* Top Controls & Period Selector */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                WhatsApp Cash Flow Sharing
              </CardTitle>
              <CardDescription>
                Track and share cash flow: <span className="font-semibold text-foreground">Received − Expenses − Bill Paid = Profit</span> from shopkeeper to owner.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono py-1 px-2.5 bg-background">
                {searchTag}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-4">
            <span className="text-xs font-medium text-muted-foreground mr-1">Period Type:</span>
            <Button
              type="button"
              size="sm"
              variant={periodMode === 'weekly' ? 'default' : 'outline'}
              onClick={() => {
                setPeriodMode('weekly');
                setCustomMessageOverride(null);
              }}
              className="h-8 text-xs gap-1.5"
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Weekly (by Month)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodMode === 'daily' ? 'default' : 'outline'}
              onClick={() => {
                setPeriodMode('daily');
                setCustomMessageOverride(null);
              }}
              className="h-8 text-xs gap-1.5"
            >
              Daily (Single Date)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodMode === 'custom' ? 'default' : 'outline'}
              onClick={() => {
                setPeriodMode('custom');
                setCustomMessageOverride(null);
              }}
              className="h-8 text-xs gap-1.5"
            >
              Custom Range
            </Button>
          </div>

          {/* Conditional Filters */}
          {periodMode === 'weekly' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Month</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(val) => {
                    setSelectedMonth(Number(val));
                    setCustomMessageOverride(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium mb-1.5 block">Year</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(val) => {
                    setSelectedYear(Number(val));
                    setCustomMessageOverride(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-medium mb-1.5 block">
                  Select Week <span className="text-muted-foreground">(Searchable in WhatsApp)</span>
                </Label>
                <Select
                  value={selectedWeek}
                  onValueChange={(val) => {
                    setSelectedWeek(val);
                    setCustomMessageOverride(null);
                  }}
                >
                  <SelectTrigger className="w-full font-medium">
                    <SelectValue placeholder="Choose Week" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Week (Days 01 to 07)</SelectItem>
                    <SelectItem value="2">2nd Week (Days 08 to 14)</SelectItem>
                    <SelectItem value="3">3rd Week (Days 15 to 21)</SelectItem>
                    <SelectItem value="4">4th Week (Days 22 to 28)</SelectItem>
                    <SelectItem value="5">5th Week (Days 29 to Month End)</SelectItem>
                    <SelectItem value="full">Full Month (Days 01 to Month End)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {periodMode === 'daily' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="w-full sm:w-72">
                <Label className="text-xs font-medium mb-1.5 block">Pick Date</Label>
                <DatePicker
                  value={singleDate}
                  onChange={(d) => {
                    if (d) {
                      setSingleDate(d);
                      setCustomMessageOverride(null);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {periodMode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Start Date</Label>
                <DatePicker
                  value={customStartDate}
                  onChange={(d) => {
                    if (d) {
                      setCustomStartDate(d);
                      setCustomMessageOverride(null);
                    }
                  }}
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block">End Date</Label>
                <DatePicker
                  value={customEndDate}
                  onChange={(d) => {
                    if (d) {
                      setCustomEndDate(d);
                      setCustomMessageOverride(null);
                    }
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              Active Range: <strong className="text-foreground">{format(startDate, 'dd-MMM-yyyy')}</strong> to <strong className="text-foreground">{format(endDate, 'dd-MMM-yyyy')}</strong>
            </span>
            <span>
              Search Tag: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">{searchTag}</code>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Visual Formula Display Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Received Card */}
        <Card className="border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                1. Received (Inflow)
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              ₹{formatCurrency(totalReceived)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <div>From <strong className="text-foreground">{filteredSales.length}</strong> sales invoices</div>
            {creditSalesDue > 0 && (
              <div className="text-amber-600 dark:text-amber-400 mt-0.5">
                + ₹{formatCurrency(creditSalesDue)} credit due
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card className="border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                2. Expenses (Outflow)
              </span>
              <Receipt className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-300">
              ₹{formatCurrency(totalExpenses)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <div>From <strong className="text-foreground">{filteredExpenses.length}</strong> expense entries</div>
            <div className="text-muted-foreground mt-0.5">Tea, shop ops, fuel, electricity</div>
          </CardContent>
        </Card>

        {/* Bill Paid Card */}
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                3. Bill Paid (Purchases)
              </span>
              <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">
              ₹{formatCurrency(totalBillPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <div>Paid for <strong className="text-foreground">{filteredPurchases.length}</strong> purchase bills</div>
            {pendingPurchasesDue > 0 && (
              <div className="text-muted-foreground mt-0.5">
                ₹{formatCurrency(pendingPurchasesDue)} unpaid balance
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profit / Net Cash Flow Card */}
        <Card
          className={cn(
            'border-2 shadow-md',
            netProfit >= 0
              ? 'border-emerald-600/50 bg-emerald-600/10 dark:bg-emerald-950/20'
              : 'border-destructive/50 bg-destructive/10'
          )}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'text-xs font-bold uppercase tracking-wider',
                  netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'
                )}
              >
                4. Net Profit / Cash
              </span>
              {netProfit >= 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <CardTitle
              className={cn(
                'text-2xl font-bold font-mono',
                netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-200' : 'text-destructive'
              )}
            >
              ₹{formatCurrency(netProfit)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <div className="font-medium text-foreground">
              {netProfit >= 0 ? 'Cash Surplus in Shop' : 'Cash Deficit / Overdrawn'}
            </div>
            <div className="text-muted-foreground text-[11px] mt-0.5">
              (Received − Expenses − Bills Paid)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Section: Settings vs WhatsApp Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Configuration & Message Options */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sharing Details & Options</CardTitle>
              <CardDescription>Configure recipient owner number and formatting style.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Owner WhatsApp Number */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Owner WhatsApp Mobile Number</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">+91</span>
                    <Input
                      type="tel"
                      placeholder="9876543210"
                      value={ownerPhone}
                      onChange={(e) => {
                        setOwnerPhone(e.target.value);
                        setIsSavedPhone(false);
                      }}
                      className="pl-10 font-mono text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSavePhone}
                    disabled={!ownerPhone.trim() || isSavedPhone}
                    className="shrink-0 gap-1 text-xs"
                    title="Remember this number for future weeks"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSavedPhone ? 'Saved' : 'Remember'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Leave blank to pick recipient contact in WhatsApp app.
                </p>
              </div>

              {/* Store & Sender Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Store Name</Label>
                  <Input
                    placeholder="Store Name"
                    value={storeName}
                    onChange={(e) => {
                      setStoreName(e.target.value);
                      setCustomMessageOverride(null);
                    }}
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Reported By</Label>
                  <Input
                    placeholder="Shopkeeper Name"
                    value={senderName}
                    onChange={(e) => {
                      setSenderName(e.target.value);
                      setCustomMessageOverride(null);
                    }}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Format Style */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Message Format Style</Label>
                <Select
                  value={formatStyle}
                  onValueChange={(val: MessageFormatStyle) => {
                    setFormatStyle(val);
                    setCustomMessageOverride(null);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Format Style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Cash Flow (Summary + Formula)</SelectItem>
                    <SelectItem value="detailed">Detailed Itemized (Lists Expenses & Bills)</SelectItem>
                    <SelectItem value="compact">Compact / Short (5 Lines)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Physical Cash in Hand (Optional) */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block">
                  Physical Cash in Cash-Box (Optional)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    placeholder="e.g. 15000"
                    value={cashInHand}
                    onChange={(e) => {
                      setCashInHand(e.target.value);
                      setCustomMessageOverride(null);
                    }}
                    className="pl-7 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Remarks / Custom Note */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Closing Notes / Message to Owner</Label>
                <Textarea
                  placeholder="e.g. Handed over ₹15,000 cash to owner on Saturday evening. ₹3,500 kept in cash counter for morning changes."
                  value={closingNotes}
                  onChange={(e) => {
                    setClosingNotes(e.target.value);
                    setCustomMessageOverride(null);
                  }}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: WhatsApp Real-time Chat Mockup & Action Buttons */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-emerald-600/30 overflow-hidden shadow-md">
            {/* WhatsApp App Mock Header */}
            <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center font-bold text-sm">
                  {storeName.slice(0, 1).toUpperCase() || 'S'}
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                    {ownerPhone.trim() ? `Owner (${ownerPhone})` : 'Store Owner'}
                  </div>
                  <div className="text-[11px] text-emerald-200">Online • WhatsApp Cash Flow Preview</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingMessage(!isEditingMessage)}
                  className="text-white hover:bg-emerald-800 text-xs h-8 gap-1"
                >
                  {isEditingMessage ? 'Preview View' : 'Edit Text'}
                </Button>
              </div>
            </div>

            {/* Chat Body Mockup */}
            <CardContent className="bg-emerald-50/40 dark:bg-zinc-950/40 p-4 min-h-[380px] flex flex-col justify-between">
              {isEditingMessage ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Direct Message Editor</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustomMessageOverride(null)}
                      className="text-xs h-6 text-muted-foreground hover:text-foreground gap-1"
                    >
                      <RefreshCw className="h-3 w-3" /> Reset to Auto-Generated
                    </Button>
                  </div>
                  <Textarea
                    value={finalMessage}
                    onChange={(e) => setCustomMessageOverride(e.target.value)}
                    rows={16}
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
              ) : (
                <div className="flex justify-end">
                  {/* WhatsApp Chat Bubble */}
                  <div className="max-w-[92%] sm:max-w-[85%] bg-emerald-100 dark:bg-emerald-950/80 text-foreground border border-emerald-300/40 dark:border-emerald-800/40 rounded-2xl rounded-tr-sm p-4 shadow-sm text-xs leading-relaxed font-sans whitespace-pre-wrap select-text">
                    {finalMessage}
                    <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground font-mono">
                      <span>{format(new Date(), 'hh:mm a')}</span>
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>

            {/* Action Bar */}
            <CardFooter className="bg-background border-t p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={handleCopyMessage}
                className="w-full sm:w-auto gap-2"
              >
                {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {isCopied ? 'Copied to Clipboard!' : 'Copy Message'}
              </Button>

              <Button
                type="button"
                size="default"
                onClick={handleShareWhatsApp}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold shadow-sm"
              >
                <Share2 className="h-4 w-4" />
                Share via WhatsApp
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Transaction Details Accordion / Tabs to Verify Numbers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Underlying Transactions for Selected Period</CardTitle>
          <CardDescription>
            Verify the sales collections, recorded expenses, and vendor bills paid that produce the cash flow formula.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sales" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="sales">
                Sales ({filteredSales.length})
              </TabsTrigger>
              <TabsTrigger value="expenses">
                Expenses ({filteredExpenses.length})
              </TabsTrigger>
              <TabsTrigger value="purchases">
                Bills Paid ({filteredPurchases.length})
              </TabsTrigger>
            </TabsList>

            {/* Sales Tab */}
            <TabsContent value="sales" className="mt-4">
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Billed (₹)</TableHead>
                      <TableHead className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        Received (₹)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                          No sales recorded in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSales.map((s) => {
                        const rec = s.amountPaid !== undefined && s.amountPaid !== null
                          ? Number(s.amountPaid)
                          : s.paymentStatus === 'Paid'
                          ? Number(s.total)
                          : 0;
                        return (
                          <TableRow key={s.id} className="text-xs">
                            <TableCell className="font-mono font-medium">{s.invoiceNumber || s.id.slice(0, 8)}</TableCell>
                            <TableCell>{s.date ? format(new Date(s.date), 'dd-MMM-yyyy') : '-'}</TableCell>
                            <TableCell>{s.customerName || 'Walk-in Customer'}</TableCell>
                            <TableCell>
                              <Badge
                                variant={s.paymentStatus === 'Paid' ? 'secondary' : 'outline'}
                                className="text-[10px]"
                              >
                                {s.paymentStatus || 'Paid'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">₹{formatCurrency(s.total || 0)}</TableCell>
                            <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              ₹{formatCurrency(rec)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Expenses Tab */}
            <TabsContent value="expenses" className="mt-4">
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Expense Type</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right font-semibold text-rose-600 dark:text-rose-400">
                        Amount (₹)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                          No expenses recorded in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.map((e) => (
                        <TableRow key={e.id} className="text-xs">
                          <TableCell>{e.date ? format(new Date(e.date), 'dd-MMM-yyyy') : '-'}</TableCell>
                          <TableCell className="font-medium">{e.expenseType}</TableCell>
                          <TableCell className="text-muted-foreground">{e.notes || '-'}</TableCell>
                          <TableCell className="text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                            ₹{formatCurrency(e.amount || 0)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Purchases / Bills Paid Tab */}
            <TabsContent value="purchases" className="mt-4">
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier / Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Bill Total (₹)</TableHead>
                      <TableHead className="text-right font-semibold text-amber-600 dark:text-amber-400">
                        Paid Out (₹)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                          No purchase bills recorded in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchases.map((p) => {
                        const paid = p.amountPaid !== undefined && p.amountPaid !== null
                          ? Number(p.amountPaid)
                          : p.paymentStatus === 'Paid'
                          ? Number(p.totalAmount)
                          : 0;
                        return (
                          <TableRow key={p.id} className="text-xs">
                            <TableCell className="font-mono font-medium">{p.invoiceNo}</TableCell>
                            <TableCell>{p.date ? format(new Date(p.date), 'dd-MMM-yyyy') : '-'}</TableCell>
                            <TableCell className="font-medium">{p.supplierName}</TableCell>
                            <TableCell>
                              <Badge
                                variant={p.paymentStatus === 'Paid' ? 'secondary' : 'outline'}
                                className="text-[10px]"
                              >
                                {p.paymentStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">₹{formatCurrency(p.totalAmount || 0)}</TableCell>
                            <TableCell className="text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                              ₹{formatCurrency(paid)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
