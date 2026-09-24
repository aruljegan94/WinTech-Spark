'use client';

import { useState, useEffect, useRef } from 'react';
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
  ShieldAlert, Package, AlertCircle, PartyPopper, Save, RefreshCw, X,
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import {
  collection, doc, setDoc, deleteDoc, getDocs, writeBatch, query, orderBy,
} from 'firebase/firestore';
import type { Employee, AppSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, parseISO } from 'date-fns';

// ─── Barcode Generator using canvas ───────────────────────────────────────────
function generateBarcodeSVG(text: string): string {
  // Simple Code128-like visual using bars (visual only, not scannable standard)
  const bars = text.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  const width = Math.max(bars.length * 2 + 40, 200);
  let rects = '';
  bars.split('').forEach((bit, i) => {
    if (bit === '1') {
      rects += `<rect x="${20 + i * 2}" y="10" width="2" height="60" fill="black"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="90" viewBox="0 0 ${width} 90">
    <rect width="${width}" height="90" fill="white"/>
    ${rects}
    <text x="${width / 2}" y="82" text-anchor="middle" font-family="monospace" font-size="11" fill="#333">${text}</text>
  </svg>`;
}

// ─── Employee Dialog ───────────────────────────────────────────────────────────
const EMPTY_EMP: Omit<Employee, 'id'> = {
  name: '', designation: '', phone: '', email: '',
  dateOfBirth: '', dateOfJoining: '', salary: 0, notes: '',
};

export default function SettingsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

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

  // ── Notification Settings ─────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<Omit<AppSettings, 'id'>>({
    lowStockAlerts: true,
    overdueInvoiceAlerts: true,
    birthdayReminders: true,
    lowStockThreshold: 5,
  });
  const [savingNotif, setSavingNotif] = useState(false);

  // ── Barcode ───────────────────────────────────────────────────────────────
  const [barcodeText, setBarcodeText] = useState('');
  const [barcodeProductName, setBarcodeProductName] = useState('');
  const [barcodeSvg, setBarcodeSvg] = useState('');

  // ── Profit Calculator ─────────────────────────────────────────────────────
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstPct, setGstPct] = useState('18');

  // ── Data Management ───────────────────────────────────────────────────────
  const [clearTarget, setClearTarget] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // ── Profit Calc derived values ─────────────────────────────────────────────
  const cp = parseFloat(costPrice) || 0;
  const sp = parseFloat(sellingPrice) || 0;
  const gst = parseFloat(gstPct) || 0;
  const profitRaw = sp - cp;
  const profitPct = cp > 0 ? ((profitRaw / cp) * 100) : 0;
  const spWithGst = sp * (1 + gst / 100);
  const profitAfterGst = spWithGst - cp * (1 + gst / 100);

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

  // ── Employee CRUD ──────────────────────────────────────────────────────────
  const openAddEmp = () => {
    setEditingEmp(null);
    setEmpForm(EMPTY_EMP);
    setEmpDialogOpen(true);
  };

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({ name: emp.name, designation: emp.designation, phone: emp.phone,
      email: emp.email || '', dateOfBirth: emp.dateOfBirth || '',
      dateOfJoining: emp.dateOfJoining || '', salary: emp.salary || 0, notes: emp.notes || '' });
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
      await setDoc(doc(firestore, 'employees', id), { ...empForm, salary: Number(empForm.salary) || 0 });
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
      await setDoc(doc(firestore, 'settings', 'app'), notifSettings);
      toast({ title: 'Settings Saved', description: 'Notification preferences updated.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSavingNotif(false);
    }
  };

  // ── Barcode generate ─────────────────────────────────────────────────────
  const generateBarcode = () => {
    if (!barcodeText.trim()) {
      toast({ variant: 'destructive', title: 'Enter barcode value' });
      return;
    }
    setBarcodeSvg(generateBarcodeSVG(barcodeText.trim()));
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

  // ── Data export ────────────────────────────────────────────────────────────
  const exportData = async () => {
    if (!firestore) return;
    setIsExporting(true);
    try {
      const colNames = ['products', 'purchases', 'sales', 'expenses', 'employees'];
      const exportObj: Record<string, any[]> = {};
      for (const col of colNames) {
        const snap = await getDocs(collection(firestore, col));
        exportObj[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billsoft-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup Downloaded', description: 'All data exported as JSON.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Clear collection ───────────────────────────────────────────────────────
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

  return (
    <>
      <PageHeader title="Settings" description="Manage application preferences, data, and tools." />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto gap-1 p-1 bg-muted/60 rounded-xl">
          {[
            { value: 'general', icon: Settings2, label: 'General' },
            { value: 'data', icon: Database, label: 'Data' },
            { value: 'barcode', icon: Barcode, label: 'Barcode' },
            { value: 'profit', icon: Calculator, label: 'Profit Calc' },
            { value: 'employees', icon: Users, label: 'Employees' },
            { value: 'notifications', icon: Bell, label: 'Alerts' },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg text-xs font-medium py-2"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── GENERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="general">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-blue-500/10">
                    <Settings2 className="h-4 w-4 text-blue-500" />
                  </div>
                  Application Info
                </CardTitle>
                <CardDescription>About this application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'App Name', value: 'WinTech-Spark BillingSoft' },
                  { label: 'Version', value: '2.0.0' },
                  { label: 'Platform', value: 'Next.js PWA + Firebase' },
                  { label: 'Theme', value: 'Electric Crimson (#F62440)' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10">
                    <RefreshCw className="h-4 w-4 text-emerald-500" />
                  </div>
                  Quick Actions
                </CardTitle>
                <CardDescription>Common utility actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10" onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 text-emerald-500" /> Refresh Application
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 border-blue-500/30 hover:bg-blue-500/10" onClick={() => { localStorage.clear(); toast({ title: 'Local cache cleared.' }); }}>
                  <X className="h-4 w-4 text-blue-500" /> Clear Local Cache
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── DATA MANAGEMENT ──────────────────────────────────────────────── */}
        <TabsContent value="data">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Backup */}
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10">
                    <Download className="h-4 w-4 text-emerald-500" />
                  </div>
                  Backup Data
                </CardTitle>
                <CardDescription>
                  Export all your data (products, sales, purchases, expenses, employees) as a JSON file.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={exportData} disabled={isExporting} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isExporting ? 'Exporting...' : 'Download Backup (JSON)'}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Backup includes: Products, Sales, Purchases, Expenses, Employees
                </p>
              </CardContent>
            </Card>

            {/* Clear Data */}
            <Card className="border-destructive/20 bg-gradient-to-br from-destructive/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-destructive/10">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </div>
                  Clear Data
                </CardTitle>
                <CardDescription>
                  Permanently delete records from a specific collection. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'Sales / Invoices', col: 'sales', color: 'text-orange-500 border-orange-500/30 hover:bg-orange-500/10' },
                  { label: 'Purchases', col: 'purchases', color: 'text-amber-500 border-amber-500/30 hover:bg-amber-500/10' },
                  { label: 'Expenses', col: 'expenses', color: 'text-purple-500 border-purple-500/30 hover:bg-purple-500/10' },
                  { label: 'Products & Inventory', col: 'products', color: 'text-red-600 border-red-500/30 hover:bg-red-500/10' },
                ].map(({ label, col, color }) => (
                  <Button
                    key={col}
                    variant="outline"
                    className={`w-full justify-between gap-2 ${color}`}
                    onClick={() => setClearTarget(col)}
                  >
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      {label}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-current">Clear</Badge>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── BARCODE GENERATOR ────────────────────────────────────────────── */}
        <TabsContent value="barcode">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10">
                    <Barcode className="h-4 w-4 text-indigo-500" />
                  </div>
                  Barcode Generator
                </CardTitle>
                <CardDescription>Generate barcodes for your products. Download as SVG.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Product Name (optional label)</Label>
                  <Input
                    placeholder="e.g. TVS Tyre 90/90-10"
                    value={barcodeProductName}
                    onChange={(e) => setBarcodeProductName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Barcode Value / SKU *</Label>
                  <Input
                    placeholder="e.g. PROD-001 or 8901234567890"
                    value={barcodeText}
                    onChange={(e) => setBarcodeText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && generateBarcode()}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={generateBarcode} className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Barcode className="h-4 w-4" /> Generate
                  </Button>
                  {barcodeSvg && (
                    <Button variant="outline" onClick={downloadBarcode} className="gap-2 border-indigo-500/30">
                      <Download className="h-4 w-4 text-indigo-500" /> Download
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Barcode Preview */}
            <Card className="border-border/50 flex flex-col items-center justify-center min-h-[260px]">
              <CardHeader className="w-full">
                <CardTitle className="text-base text-muted-foreground">Preview</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-2 w-full">
                {barcodeSvg ? (
                  <>
                    {barcodeProductName && (
                      <p className="text-sm font-semibold text-center">{barcodeProductName}</p>
                    )}
                    <div
                      className="border rounded-lg p-3 bg-white shadow-sm w-full overflow-auto"
                      dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
                    <Barcode className="h-12 w-12 opacity-20" />
                    <p className="text-sm">Barcode preview will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PROFIT CALCULATOR ────────────────────────────────────────────── */}
        <TabsContent value="profit">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-amber-500/10">
                    <Calculator className="h-4 w-4 text-amber-500" />
                  </div>
                  Profit Calculator
                </CardTitle>
                <CardDescription>Calculate profit margin and GST-inclusive pricing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Cost Price (₹)</Label>
                    <Input type="number" placeholder="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Selling Price (₹)</Label>
                    <Input type="number" placeholder="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>GST Rate (%)</Label>
                  <div className="flex gap-2">
                    {[0, 5, 12, 18, 28].map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant={gstPct === String(v) ? 'default' : 'outline'}
                        className={gstPct === String(v) ? 'bg-primary text-white' : ''}
                        onClick={() => setGstPct(String(v))}
                      >
                        {v}%
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <Card className={`border-2 ${profitRaw >= 0 ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-card' : 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-card'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {profitRaw >= 0
                    ? <TrendingUp className="h-5 w-5 text-emerald-500" />
                    : <TrendingDown className="h-5 w-5 text-red-500" />}
                  Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Profit / Loss (before GST)', value: `₹${profitRaw.toFixed(2)}`, color: profitRaw >= 0 ? 'text-emerald-600' : 'text-red-600' },
                  { label: 'Profit Margin %', value: `${profitPct.toFixed(2)}%`, color: profitPct >= 0 ? 'text-emerald-600' : 'text-red-600' },
                  { label: `Selling Price (incl. ${gst}% GST)`, value: `₹${spWithGst.toFixed(2)}`, color: 'text-blue-600' },
                  { label: 'Net Profit (after GST)', value: `₹${profitAfterGst.toFixed(2)}`, color: profitAfterGst >= 0 ? 'text-emerald-600 font-bold text-lg' : 'text-red-600 font-bold text-lg' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-semibold ${color}`}>{value}</span>
                  </div>
                ))}
                {cp === 0 && sp === 0 && (
                  <p className="text-xs text-center text-muted-foreground pt-2">Enter cost and selling price to calculate</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── EMPLOYEES ────────────────────────────────────────────────────── */}
        <TabsContent value="employees">
          <div className="space-y-4">
            {/* Birthday Banner */}
            {upcomingBirthdays.length > 0 && (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingBirthdays.slice(0, 3).map(({ emp, daysLeft }) => (
                  <Card key={emp.id} className={`border-pink-500/30 bg-gradient-to-br from-pink-500/10 to-card flex items-center gap-3 p-4 ${daysLeft === 0 ? 'ring-2 ring-pink-500' : ''}`}>
                    <div className="p-2 rounded-full bg-pink-500/20 text-pink-500">
                      {daysLeft === 0 ? <PartyPopper className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {daysLeft === 0 ? '🎉 Birthday Today!' : `Birthday in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    Employee Database
                  </CardTitle>
                  <CardDescription>Manage your team members and their details.</CardDescription>
                </div>
                <Button size="sm" className="gap-1" onClick={openAddEmp}>
                  <Plus className="h-3.5 w-3.5" /> Add Employee
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead className="text-right">Salary</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {empLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    )}
                    {!empLoading && (employees || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No employees added yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {!empLoading && (employees || []).map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{emp.designation}</Badge>
                        </TableCell>
                        <TableCell>{emp.phone}</TableCell>
                        <TableCell>{emp.dateOfBirth ? format(parseISO(emp.dateOfBirth), 'dd-MMM') : '—'}</TableCell>
                        <TableCell className="text-right">{emp.salary ? `₹${emp.salary.toLocaleString()}` : '—'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEmp(emp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteEmpId(emp.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── NOTIFICATIONS & ALERTS ───────────────────────────────────────── */}
        <TabsContent value="notifications">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-violet-500/10">
                    <Bell className="h-4 w-4 text-violet-500" />
                  </div>
                  Notification Preferences
                </CardTitle>
                <CardDescription>Control which alerts you receive inside the app.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  {
                    key: 'lowStockAlerts',
                    icon: <Package className="h-4 w-4 text-amber-500" />,
                    label: 'Low Stock Alerts',
                    desc: 'Notify when product stock falls below threshold',
                    color: 'bg-amber-500/10',
                  },
                  {
                    key: 'overdueInvoiceAlerts',
                    icon: <AlertCircle className="h-4 w-4 text-red-500" />,
                    label: 'Overdue Invoice Alerts',
                    desc: 'Notify when pending invoices are overdue',
                    color: 'bg-red-500/10',
                  },
                  {
                    key: 'birthdayReminders',
                    icon: <Gift className="h-4 w-4 text-pink-500" />,
                    label: 'Birthday Reminders',
                    desc: 'Remind about employee birthdays',
                    color: 'bg-pink-500/10',
                  },
                ].map(({ key, icon, label, desc, color }) => (
                  <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/50 bg-background/50">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={notifSettings[key as keyof typeof notifSettings] as boolean}
                      onCheckedChange={(v) => setNotifSettings((prev) => ({ ...prev, [key]: v }))}
                    />
                  </div>
                ))}

                <div className="space-y-2 pt-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Package className="h-3.5 w-3.5 text-amber-500" />
                    Low Stock Threshold (units)
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={notifSettings.lowStockThreshold}
                    onChange={(e) => setNotifSettings((p) => ({ ...p, lowStockThreshold: Number(e.target.value) }))}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Alert when stock drops below this quantity</p>
                </div>

                <Button onClick={saveNotifSettings} disabled={savingNotif} className="w-full gap-2">
                  {savingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>

            {/* Upcoming Birthdays Sidebar */}
            <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-pink-500/10">
                    <Gift className="h-4 w-4 text-pink-500" />
                  </div>
                  Upcoming Birthdays
                </CardTitle>
                <CardDescription>Next 10 employee birthdays</CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingBirthdays.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="h-10 w-10 mx-auto opacity-20 mb-2" />
                    <p className="text-sm">No birthdays on record. Add employee DOBs in the Employees tab.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingBirthdays.map(({ emp, daysLeft, nextBirthday }) => (
                      <div key={emp.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${daysLeft === 0 ? 'border-pink-500/50 bg-pink-500/10' : daysLeft <= 7 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-background/50'}`}>
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-full ${daysLeft === 0 ? 'bg-pink-500/20' : 'bg-muted'}`}>
                            {daysLeft === 0 ? <PartyPopper className="h-3.5 w-3.5 text-pink-500" /> : <Gift className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.designation}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${daysLeft === 0 ? 'bg-pink-500 text-white border-pink-500' : daysLeft <= 7 ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' : ''}`}
                          >
                            {daysLeft === 0 ? '🎉 Today!' : `${daysLeft}d`}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{format(nextBirthday, 'dd MMM')}</p>
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

      {/* ── Employee Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmp ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogDescription>Fill in the employee details below.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Full Name *</Label>
              <Input placeholder="e.g. Ramesh Kumar" value={empForm.name} onChange={(e) => setEmpForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Designation *</Label>
              <Input placeholder="e.g. Mechanic" value={empForm.designation} onChange={(e) => setEmpForm((p) => ({ ...p, designation: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input placeholder="9876543210" value={empForm.phone} onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="email@example.com" value={empForm.email} onChange={(e) => setEmpForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Monthly Salary (₹)</Label>
              <Input type="number" placeholder="0" value={empForm.salary || ''} onChange={(e) => setEmpForm((p) => ({ ...p, salary: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>Date of Birth</Label>
              <Input type="date" value={empForm.dateOfBirth} onChange={(e) => setEmpForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date of Joining</Label>
              <Input type="date" value={empForm.dateOfJoining} onChange={(e) => setEmpForm((p) => ({ ...p, dateOfJoining: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional notes..." value={empForm.notes} onChange={(e) => setEmpForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmpDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEmployee} disabled={empSaving} className="gap-2">
              {empSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editingEmp ? 'Update' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Employee Confirm ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteEmpId} onOpenChange={(o) => !o && setDeleteEmpId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Employee?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the employee record. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEmployee} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clear Data Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!clearTarget} onOpenChange={(o) => !o && setClearTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Clear all {clearTarget}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL records in the <strong>{clearTarget}</strong> collection. This action <strong>cannot be undone</strong>. Make sure you have a backup first.
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
