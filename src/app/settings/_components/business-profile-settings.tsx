'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, setDoc } from 'firebase/firestore';
import type { CompanyProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  CreditCard,
  QrCode,
  Save,
  CheckCircle2,
  Loader2,
  Receipt,
  Percent,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  FileText,
} from 'lucide-react';

const STORAGE_KEY_DEFAULT_MARKUP = 'spark_standard_markup_percentage';

export function BusinessProfileSettings() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const profileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: profiles, isLoading } = useCollection<CompanyProfile>(profileQuery);
  const existingProfile = profiles?.[0] || null;

  const [formData, setFormData] = useState<Partial<CompanyProfile>>({
    companyName: '',
    ownedBy: '',
    address: '',
    contact: '',
    email: '',
    gstNumber: '',
    state: 'Tamil Nadu',
    stateCode: '33',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    upiId: '',
  });

  const [standardMarkup, setStandardMarkup] = useState<number>(30);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existingProfile) {
      setFormData({
        companyName: existingProfile.companyName || '',
        ownedBy: existingProfile.ownedBy || '',
        address: existingProfile.address || '',
        contact: existingProfile.contact || '',
        email: existingProfile.email || '',
        gstNumber: existingProfile.gstNumber || '',
        state: existingProfile.state || 'Tamil Nadu',
        stateCode: existingProfile.stateCode || '33',
        bankName: existingProfile.bankName || '',
        bankAccountNumber: existingProfile.bankAccountNumber || '',
        bankIfsc: existingProfile.bankIfsc || '',
        bankBranch: existingProfile.bankBranch || '',
        upiId: existingProfile.upiId || '',
      });
    }
  }, [existingProfile]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DEFAULT_MARKUP);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) setStandardMarkup(parsed);
      }
    } catch {}
  }, []);

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    if (!formData.companyName?.trim()) {
      toast({ variant: 'destructive', title: 'Company Name Required' });
      return;
    }

    setIsSaving(true);
    try {
      // 1. Save standard markup in local storage
      try {
        localStorage.setItem(STORAGE_KEY_DEFAULT_MARKUP, standardMarkup.toString());
      } catch {}

      // 2. Save profile in Firestore
      if (existingProfile?.id) {
        await setDoc(doc(firestore, 'companyProfiles', existingProfile.id), formData, { merge: true });
      } else {
        const newDocRef = doc(collection(firestore, 'companyProfiles'));
        await setDoc(newDocRef, {
          ...formData,
          id: newDocRef.id,
          isDefault: true,
        });
      }

      toast({
        title: 'Business Profile Saved',
        description: 'Company information and Bank/UPI details updated.',
      });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Failed to update company profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Preview UPI URL
  const upiId = formData.upiId || 'winautomobiles@upi';
  const previewUpiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    formData.companyName || 'Store'
  )}&cu=INR&tn=Invoice%20Payment`;
  const upiQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=${encodeURIComponent(
    previewUpiUrl
  )}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1: Business Identity & GST */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Business & GST Identity</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Appears on all GST Tax Invoices, Purchase Orders, and Reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="companyName" className="text-xs font-semibold">
                  Business / Store Name *
                </Label>
                <Input
                  id="companyName"
                  placeholder="e.g. WinTech Auto Spares"
                  value={formData.companyName || ''}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ownedBy" className="text-xs font-semibold">
                  Proprietor / Signatory
                </Label>
                <Input
                  id="ownedBy"
                  placeholder="e.g. Jegan S"
                  value={formData.ownedBy || ''}
                  onChange={(e) => handleChange('ownedBy', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="address" className="text-xs font-semibold">
                Registered Business Address
              </Label>
              <Textarea
                id="address"
                rows={2}
                placeholder="123 Main Street, Industrial Estate, City - Pincode"
                value={formData.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="contact" className="text-xs font-semibold">
                  Phone Number *
                </Label>
                <Input
                  id="contact"
                  placeholder="+91 98765 43210"
                  value={formData.contact || ''}
                  onChange={(e) => handleChange('contact', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="billing@wintech.com"
                  value={formData.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor="gstNumber" className="text-xs font-semibold">
                  GSTIN *
                </Label>
                <Input
                  id="gstNumber"
                  placeholder="33AAAAA0000A1Z5"
                  className="font-mono text-xs uppercase"
                  value={formData.gstNumber || ''}
                  onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="state" className="text-xs font-semibold">
                  State
                </Label>
                <Input
                  id="state"
                  placeholder="Tamil Nadu"
                  value={formData.state || ''}
                  onChange={(e) => handleChange('state', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stateCode" className="text-xs font-semibold">
                  State Code
                </Label>
                <Input
                  id="stateCode"
                  placeholder="33"
                  className="font-mono"
                  value={formData.stateCode || ''}
                  onChange={(e) => handleChange('stateCode', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bank & UPI Details Card */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Bank Account & UPI (Scan to Pay)</CardTitle>
              </div>
              <Badge variant="outline" className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 text-[10px]">
                Printed on Invoices
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Generates a dynamic UPI QR Code on invoices so customers can pay directly via GPay / PhonePe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bankName" className="text-xs font-semibold">
                  Bank Name
                </Label>
                <Input
                  id="bankName"
                  placeholder="e.g. State Bank of India"
                  value={formData.bankName || ''}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bankAccountNumber" className="text-xs font-semibold">
                  Bank Account Number
                </Label>
                <Input
                  id="bankAccountNumber"
                  placeholder="e.g. 382910482910"
                  className="font-mono"
                  value={formData.bankAccountNumber || ''}
                  onChange={(e) => handleChange('bankAccountNumber', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bankIfsc" className="text-xs font-semibold">
                  IFSC Code
                </Label>
                <Input
                  id="bankIfsc"
                  placeholder="e.g. SBIN0001234"
                  className="font-mono uppercase"
                  value={formData.bankIfsc || ''}
                  onChange={(e) => handleChange('bankIfsc', e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bankBranch" className="text-xs font-semibold">
                  Branch Name
                </Label>
                <Input
                  id="bankBranch"
                  placeholder="e.g. Main Branch"
                  value={formData.bankBranch || ''}
                  onChange={(e) => handleChange('bankBranch', e.target.value)}
                />
              </div>
            </div>

            {/* UPI ID & QR Preview */}
            <div className="border rounded-lg p-3 bg-muted/30 flex flex-col sm:flex-row gap-3 items-center">
              <div className="flex-1 space-y-1 w-full">
                <Label htmlFor="upiId" className="text-xs font-semibold flex items-center gap-1.5">
                  <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                  UPI ID (VPA) for Direct Customer Payment
                </Label>
                <Input
                  id="upiId"
                  placeholder="e.g. winautomobiles@okaxis or 9876543210@upi"
                  className="font-mono text-xs font-medium"
                  value={formData.upiId || ''}
                  onChange={(e) => handleChange('upiId', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Scanned by customers with GPay, PhonePe, Paytm, or BHIM.
                </p>
              </div>

              {/* QR Preview Thumbnail */}
              <div className="shrink-0 text-center bg-white p-2 rounded border shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upiQrImg}
                  alt="UPI QR Code Preview"
                  width={80}
                  height={80}
                  className="rounded"
                />
                <span className="text-[9px] text-slate-500 font-medium block mt-1">
                  Invoice QR Preview
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Inventory Markup Preferences & Invoicing Info */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Invoice Number & Terms Guidance (Single source of truth in Billing Defaults) */}
        <Card className="shadow-sm border-dashed bg-muted/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Invoice Number &amp; Terms</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Sequential numbering, prefixes/suffixes, monthly resets, and invoice terms disclaimers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-background/80 border p-3 text-xs text-muted-foreground leading-relaxed">
              💡 <strong>Unified in Billing Defaults:</strong> To avoid duplicate configuration, all invoice numbering sequences (prefixes, suffixes, monthly auto-reset, and 001 counter reset) and invoice terms &amp; conditions are now centrally managed under the <strong>Billing Defaults</strong> tab.
            </div>
            <p className="text-xs text-muted-foreground">
              Head to the <strong>Billing Defaults</strong> tab above to customize invoice numbering patterns or reset sequence numbers to 001.
            </p>
          </CardContent>
        </Card>

        {/* Default Standard Markup Preference */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Percent className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Standard Product Pricing Markup</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Default profit margin % automatically applied when entering Buying Price.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative w-36">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="500"
                  value={standardMarkup}
                  onChange={(e) => setStandardMarkup(parseFloat(e.target.value) || 0)}
                  className="pr-7 font-mono font-bold text-base"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-semibold">%</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Current standard default markup on supplier buying price.
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[15, 20, 25, 30, 35, 40, 50].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={standardMarkup === preset ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStandardMarkup(preset)}
                  className="h-7 px-2.5 text-xs rounded-full"
                >
                  +{preset}%
                </Button>
              ))}
            </div>

            <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              💡 <strong>Example:</strong> With <strong>+{standardMarkup}%</strong> standard markup, a product bought at <strong>₹1,000</strong> will auto-calculate to <strong>₹{(1000 * (1 + standardMarkup / 100)).toFixed(2)}</strong> selling price.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          size="lg"
          disabled={isSaving}
          className="min-w-[180px] gap-2 font-semibold shadow-sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving Profile...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Business Profile
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
