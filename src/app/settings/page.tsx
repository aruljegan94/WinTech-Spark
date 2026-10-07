'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Settings2, Database, Barcode, Calculator, Users, Bell, Gift, Download,
  Trash2, Plus, Pencil, CheckCircle2, TrendingUp, TrendingDown, Loader2,
  ShieldAlert, Package, AlertCircle, PartyPopper, Save, RefreshCw, X, Building2,
  Upload, Printer, IndianRupee, MessageCircle, ArrowRight, ExternalLink, HelpCircle,
  Receipt, RotateCcw
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import {
  collection, doc, setDoc, deleteDoc, getDocs, writeBatch, query, orderBy, where
} from 'firebase/firestore';
import type { Employee, AppSettings, CompanyProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, parseISO } from 'date-fns';
import { BusinessProfileSettings } from './_components/business-profile-settings';
import { generateBarcodeSVG } from '@/lib/barcode-generator';
import { formatInvoiceNumber, calculateNextSequence, getCurrentMonthKey } from '@/lib/invoice-number';
import Link from 'next/link';

const EMPTY_EMP: Omit<Employee, 'id'> = {
  name: '', designation: '', phone: '', email: '',
  dateOfBirth: '', dateOfJoining: '', salary: 0, notes: '',
};

export default function SettingsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  // ── Database Record Counters ──────────────────────────────────────────────
  const productsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'products') : null, [firestore]);
  const salesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'sales') : null, [firestore]);
  const purchasesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'purchases') : null, [firestore]);
  const expensesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'expenses') : null, [firestore]);
  const customersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'customers') : null, [firestore]);
  const vendorsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'vendors') : null, [firestore]);

  const { data: products } = useCollection(productsQuery);
  const { data: sales } = useCollection(salesQuery);
  const { data: purchases } = useCollection(purchasesQuery);
  const { data: expenses } = useCollection(expensesQuery);
  const { data: customers } = useCollection(customersQuery);
  const { data: vendors } = useCollection(vendorsQuery);

  // ── Employees ──────────────────────────────────────────────────────────────
  const empQuery = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'employees'), orderBy('name')) : null,
    [firestore]
  );
  const { data: employees, isLoading: empLoading } = useCollection<Employee>(empQuery);

  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState<Omit<Employee, 'id'>>(EMPTY_EMP);
  const [empSaving, setEmpSaving] = useState(false);
  const [deleteEmpId, setDeleteEmpId] = useState<string | null>(null);

  // ── Company Profile & Invoice Counter Queries ─────────────────────────────
  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const defaultProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  const salesCounterRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'counters', 'sales') : null),
    [firestore]
  );
  const { data: salesCounter } = useDoc<{ currentNumber: number; lastResetMonth?: string }>(salesCounterRef);

  // ── Unified Invoice Number & Terms ──────────────────────────────────────────
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [invoiceSuffix, setInvoiceSuffix] = useState('');
  const [autoResetMonthly, setAutoResetMonthly] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState(
    '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.'
  );
  const [savingInvoiceSettings, setSavingInvoiceSettings] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResettingCounter, setIsResettingCounter] = useState(false);

  // ── General Preferences (Print format, Payment Mode, etc) ───────────
  const [defaultPrintMode, setDefaultPrintMode] = useState<'thermal-80' | 'thermal-58' | 'a4'>('thermal-80');
  const [defaultPaymentMode, setDefaultPaymentMode] = useState('Cash');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // ── Notification Settings ─────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<Omit<AppSettings, 'id'>>({
    lowStockAlerts: true,
    overdueInvoiceAlerts: true,
    birthdayReminders: true,
    lowStockThreshold: 5,
  });
  const [savingNotif, setSavingNotif] = useState(false);

  // ── Barcode Quick Generator ───────────────────────────────────────────────
  const [barcodeText, setBarcodeText] = useState('8901234567890');
  const [barcodeProductName, setBarcodeProductName] = useState('RALCO Tyre Tube');
  const [barcodeSvg, setBarcodeSvg] = useState('');

  // ── Smart Margin & Profit Simulator ───────────────────────────────────────
  const [costPrice, setCostPrice] = useState('450');
  const [sellingPrice, setSellingPrice] = useState('650');
  const [targetMarginPct, setTargetMarginPct] = useState('30');
  const [gstPct, setGstPct] = useState('18');

  // ── Data Management ───────────────────────────────────────────────────────
  const [clearTarget, setClearTarget] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Load existing app settings
  useEffect(() => {
    if (!firestore) return;
    const fetchSettings = async () => {
      try {
        const snap = await getDocs(collection(firestore, 'settings'));
        snap.forEach((docSnap) => {
          if (docSnap.id === 'app') {
            const data = docSnap.data();
            setNotifSettings((prev) => ({
              ...prev,
              ...data,
            }));
            if (data.invoicePrefix && !defaultProfile?.invoicePrefix) setInvoicePrefix(data.invoicePrefix);
            if (data.invoiceSuffix && !defaultProfile?.invoiceSuffix) setInvoiceSuffix(data.invoiceSuffix);
            if (data.autoResetMonthly !== undefined && defaultProfile?.autoResetMonthly === undefined) setAutoResetMonthly(!!data.autoResetMonthly);
            if (data.termsAndConditions && !defaultProfile?.termsAndConditions) setTermsAndConditions(data.termsAndConditions);
            if (data.defaultPrintMode) setDefaultPrintMode(data.defaultPrintMode);
            if (data.defaultPaymentMode) setDefaultPaymentMode(data.defaultPaymentMode);
          }
        });
      } catch (e) {
        console.error('Error fetching settings:', e);
      }
    };
    fetchSettings();
  }, [firestore, defaultProfile]);

  // Sync state when default company profile is fetched
  useEffect(() => {
    if (defaultProfile) {
      if (defaultProfile.invoicePrefix !== undefined) setInvoicePrefix(defaultProfile.invoicePrefix);
      if (defaultProfile.invoiceSuffix !== undefined) setInvoiceSuffix(defaultProfile.invoiceSuffix);
      if (defaultProfile.autoResetMonthly !== undefined) setAutoResetMonthly(!!defaultProfile.autoResetMonthly);
      if (defaultProfile.termsAndConditions !== undefined) setTermsAndConditions(defaultProfile.termsAndConditions);
    }
  }, [defaultProfile]);

  // Initial barcode render
  useEffect(() => {
    try {
      setBarcodeSvg(generateBarcodeSVG(barcodeText, { height: 60, showText: true }));
    } catch {
      // ignore
    }
  }, [barcodeText]);

  // ── Profit Simulator Calculations ─────────────────────────────────────────
  const cp = parseFloat(costPrice) || 0;
  const sp = parseFloat(sellingPrice) || 0;
  const gst = parseFloat(gstPct) || 0;
  const rawProfit = sp - cp;
  const marginPct = cp > 0 ? (rawProfit / cp) * 100 : 0;
  const gstAmountOnSP = (sp * gst) / 100;
  const mrpInclusive = sp + gstAmountOnSP;
  const gstPaidOnPurchase = (cp * gst) / 100;
  const netGstPayable = Math.max(0, gstAmountOnSP - gstPaidOnPurchase);
  const recommendedWholesale = Math.round(cp * 1.15);
  const recommendedRetail = Math.round(cp * 1.30);

  // ── Birthday helpers ───────────────────────────────────────────────────────
  const upcomingBirthdays = (employees || [])
    .filter((e) => e.dateOfBirth)
    .map((e) => {
      const dob = parseISO(e.dateOfBirth!);
      const today = new Date();
      const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      const nextBirthday = thisYear < today
        ? new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate())
        : thisYear;
      const daysLeft = differenceInDays(nextBirthday, today);
      return { emp: e, daysLeft, nextBirthday };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  // Payroll summary
  const totalPayrollMonthly = (employees || []).reduce((acc, e) => acc + (Number(e.salary) || 0), 0);

  // ── Save Unified Invoice Number & Terms ────────────────────────────────────
  const saveInvoiceSettings = async () => {
    if (!firestore) return;
    setSavingInvoiceSettings(true);
    try {
      if (defaultProfile?.id) {
        await setDoc(doc(firestore, 'companyProfiles', defaultProfile.id), {
          invoicePrefix,
          invoiceSuffix,
          autoResetMonthly,
          termsAndConditions,
        }, { merge: true });
      } else {
        const snap = await getDocs(collection(firestore, 'companyProfiles'));
        if (!snap.empty) {
          await setDoc(snap.docs[0].ref, {
            invoicePrefix,
            invoiceSuffix,
            autoResetMonthly,
            termsAndConditions,
          }, { merge: true });
        }
      }

      await setDoc(doc(firestore, 'settings', 'app'), {
        invoicePrefix,
        invoiceSuffix,
        autoResetMonthly,
        termsAndConditions,
      }, { merge: true });

      toast({
        title: 'Invoice Number & Terms Saved',
        description: 'Invoice numbering sequence and terms disclaimers updated.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSavingInvoiceSettings(false);
    }
  };

  // ── Reset Sales Invoice Counter to 001 ─────────────────────────────────────
  const handleResetCounter = async () => {
    if (!firestore) return;
    setIsResettingCounter(true);
    try {
      await setDoc(doc(firestore, 'counters', 'sales'), {
        currentNumber: 0,
        lastResetMonth: getCurrentMonthKey(),
        resetAt: new Date().toISOString(),
      }, { merge: true });

      toast({
        title: 'Invoice Counter Reset',
        description: 'Sequence counter reset to 0. Next invoice will start at 001.',
      });
      setResetDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reset Failed', description: e.message });
    } finally {
      setIsResettingCounter(false);
    }
  };

  // ── Save Print Hardware & Payment Defaults ────────────────────────────────
  const saveGeneralPreferences = async () => {
    if (!firestore) return;
    setSavingGeneral(true);
    try {
      await setDoc(doc(firestore, 'settings', 'app'), {
        defaultPrintMode,
        defaultPaymentMode,
      }, { merge: true });

      toast({
        title: 'Hardware & Payment Saved',
        description: 'Default printer format and payment mode updated.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSavingGeneral(false);
    }
  };

  // ── Employee CRUD ──────────────────────────────────────────────────────────
  const openAddEmp = () => {
    setEditingEmp(null);
    setEmpForm(EMPTY_EMP);
    setEmpDialogOpen(true);
  };

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name, designation: emp.designation, phone: emp.phone,
      email: emp.email || '', dateOfBirth: emp.dateOfBirth || '',
      dateOfJoining: emp.dateOfJoining || '', salary: emp.salary || 0, notes: emp.notes || ''
    });
    setEmpDialogOpen(true);
  };

  const saveEmployee = async () => {
    if (!firestore || !empForm.name.trim() || !empForm.designation.trim()) {
      toast({ variant: 'destructive', title: 'Name & Designation are required.' });
      return;
    }
    setEmpSaving(true);
    try {
      const id = editingEmp?.id || doc(collection(firestore, 'employees')).id;
      await setDoc(doc(firestore, 'employees', id), {
        ...empForm,
        salary: Number(empForm.salary) || 0,
      });
      toast({ title: editingEmp ? 'Employee Updated' : 'Employee Added', description: empForm.name });
      setEmpDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setEmpSaving(false);
    }
  };

  const deleteEmployee = async () => {
    if (!firestore || !deleteEmpId) return;
    await deleteDoc(doc(firestore, 'employees', deleteEmpId));
    setDeleteEmpId(null);
    toast({ title: 'Employee Removed' });
  };

  // ── Save notification settings ─────────────────────────────────────────────
  const saveNotifSettings = async () => {
    if (!firestore) return;
    setSavingNotif(true);
    try {
      await setDoc(doc(firestore, 'settings', 'app'), notifSettings, { merge: true });
      toast({ title: 'Settings Saved', description: 'Notification preferences updated.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSavingNotif(false);
    }
  };

  // ── Barcode generate ───────────────────────────────────────────────────────
  const generateBarcode = () => {
    if (!barcodeText.trim()) {
      toast({ variant: 'destructive', title: 'Enter barcode value' });
      return;
    }
    try {
      setBarcodeSvg(generateBarcodeSVG(barcodeText.trim(), { height: 60, showText: true }));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Invalid Barcode Value' });
    }
  };

  const downloadBarcode = () => {
    if (!barcodeSvg) return;
    const blob = new Blob([barcodeSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${barcodeText}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Full Database Export ───────────────────────────────────────────────────
  const exportData = async () => {
    if (!firestore) return;
    setIsExporting(true);
    try {
      const colNames = ['products', 'purchases', 'sales', 'expenses', 'employees', 'customers', 'vendors'];
      const exportObj: Record<string, any[]> = {};
      for (const col of colNames) {
        const snap = await getDocs(collection(firestore, col));
        exportObj[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billingsoft-complete-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup Downloaded', description: 'Complete database exported as JSON.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Restore Data from Backup File ──────────────────────────────────────────
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firestore) return;

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        let restoredCount = 0;

        for (const [colName, records] of Object.entries(json)) {
          if (Array.isArray(records)) {
            const batch = writeBatch(firestore);
            records.forEach((rec: any) => {
              const { id, ...data } = rec;
              if (id) {
                batch.set(doc(firestore, colName, id), data, { merge: true });
                restoredCount++;
              }
            });
            await batch.commit();
          }
        }

        toast({
          title: 'Database Restored Successfully',
          description: `Restored/Merged ${restoredCount} records across collections.`,
        });
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Restore Failed',
          description: err.message || 'Invalid backup JSON file.',
        });
      } finally {
        setIsRestoring(false);
        if (restoreInputRef.current) restoreInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ── Clear Collection ───────────────────────────────────────────────────────
  const clearCollection = async () => {
    if (!firestore || !clearTarget) return;
    setIsClearing(true);
    try {
      const snap = await getDocs(collection(firestore, clearTarget));
      const batch = writeBatch(firestore);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      toast({ title: `${clearTarget} Cleared`, description: `All ${snap.size} records deleted.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsClearing(false);
      setClearTarget(null);
    }
  };

  const currentCount = salesCounter?.currentNumber ?? 0;
  const nextSeq = calculateNextSequence(salesCounter, autoResetMonthly);
  const previewInvoiceNumber = formatInvoiceNumber({
    prefix: invoicePrefix,
    suffix: invoiceSuffix,
    sequenceNumber: nextSeq,
    date: new Date(),
  });

  return (
    <>
      <PageHeader
        title="Settings & System Configurations"
        description="Configure billing defaults, pricing simulators, team payroll, data backups, and hardware tools."
      />

      <Tabs defaultValue="general" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto gap-1 p-1 bg-muted/60 rounded-xl">
          {[
            { value: 'profile', icon: Building2, label: 'Business Profile' },
            { value: 'general', icon: Settings2, label: 'Billing Defaults' },
            { value: 'data', icon: Database, label: 'Data & Backup' },
            { value: 'profit', icon: Calculator, label: 'Price Simulator' },
            { value: 'barcode', icon: Barcode, label: 'Barcode Tools' },
            { value: 'employees', icon: Users, label: 'Team & Payroll' },
            { value: 'notifications', icon: Bell, label: 'Alerts & Rules' },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs rounded-lg text-xs font-medium py-1.5"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── 1. BUSINESS PROFILE & BANK ──────────────────────────────────── */}
        <TabsContent value="profile">
          <BusinessProfileSettings />
        </TabsContent>

        {/* ── 2. GENERAL & BILLING DEFAULTS ──────────────────────────────── */}
        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Unified Invoice Number & Terms Card */}
            <Card className="border-primary/20 shadow-xs">
              <CardHeader className="p-4 pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="p-1 rounded-md bg-primary/10 text-primary">
                      <Receipt className="h-4 w-4" />
                    </div>
                    Invoice Number &amp; Terms
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Single Billing Source
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Sequential numbering, monthly auto-resets, prefix/suffix patterns, and legal invoice terms.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5 text-xs">
                {/* Prefix and Suffix */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Invoice Prefix</Label>
                    <Input
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value)}
                      placeholder="e.g. INV- or WT/"
                      className="h-8 font-mono text-xs uppercase"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Invoice Suffix (Optional)</Label>
                    <Input
                      value={invoiceSuffix}
                      onChange={(e) => setInvoiceSuffix(e.target.value)}
                      placeholder="e.g. /26 or -M"
                      className="h-8 font-mono text-xs uppercase"
                    />
                  </div>
                </div>

                {/* Tokens and Presets */}
                <div className="space-y-1.5 bg-muted/30 p-2.5 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">Dynamic Date Tokens:</span>
                    <div className="flex flex-wrap gap-1">
                      {['{YY}', '{MM}', '{MMM}', '{YYYY}', '{FY}'].map((token) => (
                        <Badge
                          key={token}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 cursor-pointer font-mono hover:bg-primary/20 transition-colors"
                          title={`Click to append ${token} to prefix`}
                          onClick={() => setInvoicePrefix((prev) => `${prev}${token}`)}
                        >
                          +{token}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                    <span className="text-[10px] text-muted-foreground">Presets:</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2"
                      onClick={() => { setInvoicePrefix('INV-'); setInvoiceSuffix(''); }}
                    >
                      Default: INV-001
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2"
                      onClick={() => { setInvoicePrefix('INV-{YY}{MM}-'); setInvoiceSuffix(''); }}
                    >
                      Monthly: INV-2610-001
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-2"
                      onClick={() => { setInvoicePrefix('INV/{FY}/'); setInvoiceSuffix(''); }}
                    >
                      FY: INV/26-27/001
                    </Button>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Next Invoice Preview</div>
                    <div className="font-mono font-bold text-sm text-foreground mt-0.5">
                      {previewInvoiceNumber}
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">
                    Sequence #{nextSeq}
                  </Badge>
                </div>

                {/* Monthly Auto Reset Switch */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-0.5">
                    <div className="font-medium text-xs text-foreground">Auto-Reset Sequence Monthly</div>
                    <div className="text-[11px] text-muted-foreground">
                      Automatically restarts invoice counter from 001 on the 1st of each calendar month.
                    </div>
                  </div>
                  <Switch
                    checked={autoResetMonthly}
                    onCheckedChange={setAutoResetMonthly}
                  />
                </div>

                {/* Counter Status & Manual Reset to 001 */}
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-medium text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      Sequence Generator Counter
                    </div>
                    <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      Current Counter: <strong>#{currentCount}</strong> (Next created: <strong>#{nextSeq}</strong>)
                    </div>
                  </div>
                  <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResetDialogOpen(true)}
                      className="h-7 text-xs gap-1.5 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100/50 dark:hover:bg-amber-950/50 shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to 001
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <RotateCcw className="h-5 w-5 text-amber-500" />
                          Reset Invoice Sequence to 001?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                          <p>
                            This will reset the internal sales sequence counter to 0. The next invoice created will start at <strong>001</strong>.
                          </p>
                          <div className="p-2.5 rounded bg-muted font-mono text-xs text-foreground">
                            Next Generated Invoice: <strong>{formatInvoiceNumber({ prefix: invoicePrefix, suffix: invoiceSuffix, sequenceNumber: 1, date: new Date() })}</strong>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Note: Existing invoices already saved in the database will not be affected.
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleResetCounter}
                          disabled={isResettingCounter}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {isResettingCounter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, Reset to 001'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Terms and Conditions */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Invoice Terms &amp; Conditions</Label>
                    <span className="text-[10px] text-muted-foreground">Printed on Tax Invoices &amp; PDF</span>
                  </div>
                  <Textarea
                    rows={3}
                    value={termsAndConditions}
                    onChange={(e) => setTermsAndConditions(e.target.value)}
                    placeholder="1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction."
                    className="text-xs font-mono"
                  />
                </div>

                <Button
                  onClick={saveInvoiceSettings}
                  disabled={savingInvoiceSettings}
                  className="w-full gap-2 h-8 text-xs bg-primary"
                >
                  {savingInvoiceSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Invoice Number &amp; Terms
                </Button>
              </CardContent>
            </Card>

            {/* Right Column: Hardware & Payment Defaults */}
            <div className="space-y-4">
              <Card className="border-border shadow-xs">
                <CardHeader className="p-4 pb-2 border-b">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div className="p-1 rounded-md bg-primary/10 text-primary">
                      <Printer className="h-4 w-4" />
                    </div>
                    Print Hardware &amp; Payment Defaults
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Default printer paper output and default payment method when creating invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Default Receipt Paper Format</Label>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { id: 'thermal-80', label: '80mm Thermal', sub: 'Standard Roll' },
                        { id: 'thermal-58', label: '58mm Thermal', sub: 'Compact Roll' },
                        { id: 'a4', label: 'A4 Laser', sub: 'Full Sheet' },
                      ].map((mode) => (
                        <div
                          key={mode.id}
                          onClick={() => setDefaultPrintMode(mode.id as any)}
                          className={`cursor-pointer border rounded-lg p-2 text-center transition-all ${
                            defaultPrintMode === mode.id
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border hover:bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          <Printer className="h-4 w-4 mx-auto mb-1 opacity-70" />
                          <div className="text-[11px]">{mode.label}</div>
                          <div className="text-[10px] opacity-70">{mode.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Default Payment Mode on Invoice Creation</Label>
                    <div className="flex gap-2">
                      {['Cash', 'UPI', 'Bank Transfer'].map((m) => (
                        <Button
                          key={m}
                          type="button"
                          size="sm"
                          variant={defaultPaymentMode === m ? 'default' : 'outline'}
                          className="h-7 text-xs flex-1"
                          onClick={() => setDefaultPaymentMode(m)}
                        >
                          {m}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={saveGeneralPreferences}
                    disabled={savingGeneral}
                    className="w-full gap-2 mt-2 h-8 text-xs"
                    variant="outline"
                  >
                    {savingGeneral ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Hardware &amp; Payment Defaults
                  </Button>
                </CardContent>
              </Card>

            {/* System Status & Cache Maintenance */}
            <Card className="border-border shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-500">
                    <Settings2 className="h-4 w-4" />
                  </div>
                  System Environment &amp; Cache Maintenance
                </CardTitle>
                <CardDescription className="text-xs">
                  Active Progressive Web App runtime details and cloud cache tools.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="divide-y text-xs">
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Software Core</span>
                    <span className="font-medium">WinTech-Spark Suite v2.0 (PWA)</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Database Engine</span>
                    <span className="font-medium flex items-center gap-1 text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Google Cloud Firestore (Live Online)
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Offline Storage</span>
                    <span className="font-medium">IndexedDB Local Cache Enabled</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Regional Currency</span>
                    <span className="font-mono font-medium">INR (₹) Indian Rupee</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-primary" /> Reload &amp; Refresh Workspace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs text-amber-600 hover:bg-amber-500/10 border-amber-500/30"
                    onClick={() => {
                      localStorage.clear();
                      toast({ title: 'Local Cache Cleared', description: 'Application state refreshed.' });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Purge Local Browser Cache
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

        {/* ── 3. DATA & BACKUP (AWESOME LIVE METRICS & RESTORE) ──────────── */}
        <TabsContent value="data" className="space-y-3">
          {/* Live Records Matrix */}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Products', count: (products || []).length, color: 'text-indigo-600' },
              { label: 'Sales Invoices', count: (sales || []).length, color: 'text-emerald-600' },
              { label: 'Purchases', count: (purchases || []).length, color: 'text-cyan-600' },
              { label: 'Expenses', count: (expenses || []).length, color: 'text-amber-600' },
              { label: 'Customers', count: (customers || []).length, color: 'text-rose-600' },
              { label: 'Suppliers', count: (vendors || []).length, color: 'text-purple-600' },
            ].map((col) => (
              <div key={col.label} className="bg-muted/40 p-2.5 rounded-lg border text-center">
                <span className="text-[11px] text-muted-foreground">{col.label}</span>
                <div className={`text-lg font-bold ${col.color}`}>{col.count}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Backup & Restore */}
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                    <Download className="h-4 w-4" />
                  </div>
                  Full Database Backup &amp; Restore
                </CardTitle>
                <CardDescription className="text-xs">
                  Export complete store database or restore from a previously downloaded JSON backup file.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <Button
                  onClick={exportData}
                  disabled={isExporting}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isExporting ? 'Exporting...' : 'Download Full JSON Backup'}
                </Button>

                <div className="border-t pt-3">
                  <Label className="text-xs block mb-1">Restore Database from Backup File</Label>
                  <input
                    ref={restoreInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleRestoreFile}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRestoring}
                    onClick={() => restoreInputRef.current?.click()}
                    className="w-full gap-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs h-9"
                  >
                    {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {isRestoring ? 'Restoring records...' : 'Select Backup JSON to Restore'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Safely merges records without duplicating existing IDs.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Clear Collections */}
            <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 via-card to-card">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-destructive/10 text-destructive">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  Selective Collection Purge (Dangerous)
                </CardTitle>
                <CardDescription className="text-xs">
                  Permanently reset testing data before going live. Protected by double confirmation.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {[
                  { label: 'Sales Invoices', col: 'sales', color: 'text-orange-500 border-orange-500/30 hover:bg-orange-500/10' },
                  { label: 'Purchases Bills', col: 'purchases', color: 'text-amber-500 border-amber-500/30 hover:bg-amber-500/10' },
                  { label: 'Expenses Records', col: 'expenses', color: 'text-purple-500 border-purple-500/30 hover:bg-purple-500/10' },
                  { label: 'Products Catalog', col: 'products', color: 'text-red-600 border-red-500/30 hover:bg-red-500/10' },
                ].map(({ label, col, color }) => (
                  <Button
                    key={col}
                    variant="outline"
                    size="sm"
                    className={`w-full justify-between gap-2 text-xs h-8 ${color}`}
                    onClick={() => setClearTarget(col)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      {label}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 font-normal border-current">Purge</Badge>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 4. PROFIT & PRICING STRATEGY SIMULATOR (AWESOME UPGRADE) ───── */}
        <TabsContent value="profit" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-12">
            {/* Input Form */}
            <Card className="md:col-span-6 border-amber-500/20 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                    <Calculator className="h-4 w-4" />
                  </div>
                  Product Pricing &amp; Margin Simulator
                </CardTitle>
                <CardDescription className="text-xs">
                  Model retail markups, wholesale rates, and input tax credit (ITC) offsets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Buying Cost Price (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 450"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target Selling Price (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 650"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Quick Markup Presets */}
                <div className="space-y-1">
                  <Label className="text-xs">Quick Target Margin Presets</Label>
                  <div className="flex gap-1.5">
                    {[15, 20, 25, 30, 40, 50].map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px] flex-1"
                        onClick={() => {
                          const base = parseFloat(costPrice) || 0;
                          setSellingPrice(String(Math.round(base * (1 + m / 100))));
                        }}
                      >
                        +{m}%
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Applicable GST Slab (%)</Label>
                  <div className="flex gap-2">
                    {[0, 5, 12, 18, 28].map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant={gstPct === String(v) ? 'default' : 'outline'}
                        className={`h-7 text-xs flex-1 ${gstPct === String(v) ? 'bg-primary text-white font-semibold' : ''}`}
                        onClick={() => setGstPct(String(v))}
                      >
                        {v}%
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strategy Output Breakdown */}
            <Card className="md:col-span-6 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <span>Pricing Recommendations</span>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs font-bold">
                    {marginPct.toFixed(1)}% Markup
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <div className="divide-y">
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Pre-Tax Gross Margin (Profit/Unit)</span>
                    <span className="font-bold text-emerald-600 text-sm">₹{rawProfit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Recommended Wholesale (15% Markup)</span>
                    <span className="font-semibold">₹{recommendedWholesale.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Recommended Retail (30% Markup)</span>
                    <span className="font-semibold">₹{recommendedRetail.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Final Bill MRP (incl. {gst}% GST)</span>
                    <span className="font-bold text-sm text-foreground">₹{mrpInclusive.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Input Tax Credit (ITC Offset Claimable)</span>
                    <span className="text-cyan-600 font-medium">₹{gstPaidOnPurchase.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Net GST Payable to Govt</span>
                    <span className="text-muted-foreground">₹{netGstPayable.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 5. BARCODE TOOLS & DIRECT LINK ─────────────────────────────── */}
        <TabsContent value="barcode" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-12">
            {/* Quick SVG Barcode */}
            <Card className="md:col-span-7 border-indigo-500/20 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-500">
                    <Barcode className="h-4 w-4" />
                  </div>
                  Quick Single Barcode Generator
                </CardTitle>
                <CardDescription className="text-xs">
                  Generate instant Code 128 vector barcodes for product labels or packaging.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Product Label Title</Label>
                    <Input
                      placeholder="e.g. Brake Shoe TVS"
                      value={barcodeProductName}
                      onChange={(e) => setBarcodeProductName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Barcode SKU / Code *</Label>
                    <Input
                      placeholder="e.g. 8901234567890"
                      value={barcodeText}
                      onChange={(e) => setBarcodeText(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={generateBarcode} className="h-8 text-xs flex-1 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Barcode className="h-3.5 w-3.5" /> Generate Barcode
                  </Button>
                  {barcodeSvg && (
                    <Button variant="outline" onClick={downloadBarcode} className="h-8 text-xs gap-1.5 border-indigo-500/30">
                      <Download className="h-3.5 w-3.5" /> Download SVG
                    </Button>
                  )}
                </div>

                {barcodeSvg && (
                  <div className="border rounded-lg p-3 bg-white shadow-2xs flex flex-col items-center">
                    {barcodeProductName && (
                      <div className="text-xs font-bold text-gray-800 mb-1">{barcodeProductName}</div>
                    )}
                    <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Link to Dedicated Label Printer */}
            <Card className="md:col-span-5 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card flex flex-col justify-between shadow-xs">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Printer className="h-4 w-4 text-primary" />
                  Thermal Roll &amp; Sticker Sheets
                </CardTitle>
                <CardDescription className="text-xs">
                  Need to print multiple label rolls or 24/40/65 sticker sheets with store branding and GST?
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="space-y-1.5 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Supports 50x25mm, 50x38mm, 38x25mm rolls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Supports A4 sticker sheets (24, 40, 65 labels)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Pick items directly from product inventory</span>
                  </div>
                </div>

                <Button className="w-full gap-2 text-xs h-9 bg-primary" asChild>
                  <Link href="/barcodes">
                    <span>Open Label Generator</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 6. EMPLOYEES & PAYROLL (AWESOME METRICS & WHATSAPP) ─────────── */}
        <TabsContent value="employees" className="space-y-3">
          {/* Payroll & Staff Summary */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
              <span className="text-[11px] text-muted-foreground">Active Team Members</span>
              <div className="text-base font-bold">{(employees || []).length} staff</div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-indigo-700 dark:text-indigo-400">Monthly Payroll Run-rate</span>
              <div className="text-base font-bold text-indigo-600">₹{totalPayrollMonthly.toLocaleString()}</div>
            </div>
            <div className="bg-pink-500/10 border border-pink-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-pink-700 dark:text-pink-400">Upcoming Birthdays</span>
              <div className="text-base font-bold text-pink-600">{upcomingBirthdays.length} this month/year</div>
            </div>
          </div>

          <Card>
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Team Roster &amp; Salaries
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage staff members, roles, contact numbers, and payroll commitments.
                </CardDescription>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={openAddEmp}>
                <Plus className="h-3.5 w-3.5" /> Add Staff
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Staff Name</TableHead>
                    <TableHead className="w-[120px]">Designation</TableHead>
                    <TableHead className="w-[120px]">Phone</TableHead>
                    <TableHead className="w-[100px]">Birthday</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">Monthly Salary</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading employee roster...
                      </TableCell>
                    </TableRow>
                  )}
                  {!empLoading && (employees || []).map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-semibold text-xs">{emp.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] h-4 font-normal bg-primary/10 text-primary border-primary/20">
                          {emp.designation}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {emp.phone || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {emp.dateOfBirth ? format(parseISO(emp.dateOfBirth), 'dd-MMM') : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        ₹{(emp.salary || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {emp.phone && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                              title="Chat on WhatsApp"
                              asChild
                            >
                              <a
                                href={`https://wa.me/91${emp.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEmp(emp)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteEmpId(emp.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!empLoading && (employees || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                        No team members added yet. Click &quot;Add Staff&quot; above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 7. ALERTS & NOTIFICATIONS (AWESOME PREFERENCES) ─────────────── */}
        <TabsContent value="notifications" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-card to-card shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-violet-500/10 text-violet-500">
                    <Bell className="h-4 w-4" />
                  </div>
                  System Alert Thresholds &amp; Reminders
                </CardTitle>
                <CardDescription className="text-xs">
                  Automate in-app alerts and notifications across your team.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                {[
                  {
                    key: 'lowStockAlerts',
                    label: 'Low Stock Auto-Notifications',
                    desc: 'Notify when products fall below safe threshold',
                  },
                  {
                    key: 'overdueInvoiceAlerts',
                    label: 'Overdue Customer Invoice Alerts',
                    desc: 'Highlight unpaid customer bills past due date',
                  },
                  {
                    key: 'birthdayReminders',
                    label: 'Team Birthday Greetings Reminder',
                    desc: 'Alert when team member birthday arrives',
                  },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-2.5 rounded-lg border bg-background/50">
                    <div>
                      <p className="font-semibold">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={Boolean(notifSettings[key as keyof typeof notifSettings])}
                      onCheckedChange={(v) => setNotifSettings((p) => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}

                <div className="space-y-1 pt-1">
                  <Label className="text-xs">Low Stock Threshold (units)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={notifSettings.lowStockThreshold}
                    onChange={(e) => setNotifSettings((p) => ({ ...p, lowStockThreshold: Number(e.target.value) }))}
                    className="h-8 w-28 text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Products with inventory at or below this value show amber/red warnings.
                  </p>
                </div>

                <Button onClick={saveNotifSettings} disabled={savingNotif} className="w-full gap-2 h-8 text-xs bg-primary">
                  {savingNotif ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Alert Settings
                </Button>
              </CardContent>
            </Card>

            {/* Birthday Calendar Preview */}
            <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/5 via-card to-card shadow-xs">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-pink-500/10 text-pink-500">
                    <Gift className="h-4 w-4" />
                  </div>
                  Upcoming Celebrations &amp; Birthdays
                </CardTitle>
                <CardDescription className="text-xs">
                  Next scheduled staff birthdays in your organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {upcomingBirthdays.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">
                    <Gift className="h-8 w-8 mx-auto opacity-30 mb-1" />
                    No birthdays on record. Add employee birth dates in the Team tab.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {upcomingBirthdays.map(({ emp, daysLeft, nextBirthday }) => (
                      <div
                        key={emp.id}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                          daysLeft === 0
                            ? 'border-pink-500 bg-pink-500/10 font-semibold'
                            : 'border-border/60 bg-background/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {daysLeft === 0 ? (
                            <PartyPopper className="h-4 w-4 text-pink-500" />
                          ) : (
                            <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div>
                            <span className="font-medium text-foreground">{emp.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">({emp.designation})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              daysLeft === 0
                                ? 'bg-pink-500 text-white border-pink-500'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {daysLeft === 0 ? 'Today!' : `in ${daysLeft} days`}
                          </Badge>
                          {emp.phone && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-emerald-600"
                              title="Send WhatsApp Wish"
                              asChild
                            >
                              <a
                                href={`https://wa.me/91${emp.phone.replace(/\D/g, '')}?text=Happy%20Birthday%20${encodeURIComponent(emp.name)}!%20Wishing%20you%20a%20wonderful%20year%20ahead!`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Employee Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmp ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogDescription>Fill in staff contact details and payroll salary.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Full Name *</Label>
              <Input
                placeholder="e.g. Ramesh Kumar"
                value={empForm.name}
                onChange={(e) => setEmpForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Designation / Role *</Label>
              <Input
                placeholder="e.g. Senior Mechanic"
                value={empForm.designation}
                onChange={(e) => setEmpForm((p) => ({ ...p, designation: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Phone Number</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={empForm.phone}
                onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Monthly Salary (₹)</Label>
              <Input
                type="number"
                placeholder="25000"
                value={empForm.salary || ''}
                onChange={(e) => setEmpForm((p) => ({ ...p, salary: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={empForm.dateOfBirth}
                onChange={(e) => setEmpForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Emergency contact, skills, notes..."
                value={empForm.notes}
                onChange={(e) => setEmpForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmpDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEmployee} disabled={empSaving} className="gap-2 bg-primary">
              {empSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editingEmp ? 'Update Staff' : 'Save Staff'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Employee Confirm ─────────────────────────────────────────── */}
      <AlertDialog open={!!deleteEmpId} onOpenChange={(o) => !o && setDeleteEmpId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this employee from the payroll record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEmployee} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clear Data Confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!clearTarget} onOpenChange={(o) => !o && setClearTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Clear all {clearTarget}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL records in the <strong>{clearTarget}</strong> collection. This action <strong>cannot be undone</strong>. Make sure you have exported a JSON backup first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearCollection} disabled={isClearing} className="bg-red-600 hover:bg-red-700">
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
