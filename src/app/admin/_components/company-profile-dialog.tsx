'use client';

import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  addDocumentNonBlocking,
  setDocumentNonBlocking,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { CompanyProfile } from '@/lib/types';
import { useEffect } from 'react';
import { Loader2, Building2, CreditCard } from 'lucide-react';

const companyProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  ownedBy: z.string().min(1, 'Owner name is required'),
  address: z.string().min(1, 'Address is required'),
  contact: z.string().min(1, 'Contact number is required'),
  email: z.string().optional(),
  gstNumber: z.string().min(1, 'GST number is required'),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankBranch: z.string().optional(),
  upiId: z.string().optional(),
  isDefault: z.boolean().optional(),
  invoicePrefix: z.string().optional(),
  invoiceSuffix: z.string().optional(),
});

type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>;

interface CompanyProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  profile: CompanyProfile | null;
  isDefault: boolean;
}

export function CompanyProfileDialog({
  isOpen,
  onOpenChange,
  profile,
  isDefault,
}: CompanyProfileDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
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
      isDefault: false,
      invoicePrefix: 'INV-',
      invoiceSuffix: '',
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        companyName: profile.companyName || '',
        ownedBy: profile.ownedBy || '',
        address: profile.address || '',
        contact: profile.contact || '',
        email: profile.email || '',
        gstNumber: profile.gstNumber || '',
        state: profile.state || 'Tamil Nadu',
        stateCode: profile.stateCode || '33',
        bankName: profile.bankName || '',
        bankAccountNumber: profile.bankAccountNumber || '',
        bankIfsc: profile.bankIfsc || '',
        bankBranch: profile.bankBranch || '',
        upiId: profile.upiId || '',
        isDefault: profile.isDefault ?? isDefault,
        invoicePrefix: profile.invoicePrefix || 'INV-',
        invoiceSuffix: profile.invoiceSuffix || '',
      });
    } else {
      form.reset({
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
        isDefault: isDefault,
        invoicePrefix: 'INV-',
        invoiceSuffix: '',
      });
    }
  }, [profile, form, isDefault, isOpen]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: CompanyProfileFormValues) => {
    if (!firestore) return;

    if (profile) {
      const docRef = doc(firestore, 'companyProfiles', profile.id);
      setDocumentNonBlocking(docRef, data, { merge: true });
      toast({
        title: 'Profile Updated',
        description: 'Company & Bank details successfully updated.',
      });
    } else {
      const collectionRef = collection(firestore, 'companyProfiles');
      await addDocumentNonBlocking(collectionRef, data);
      toast({
        title: 'Profile Created',
        description: 'New company profile created.',
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile ? 'Edit' : 'Add'} Company Profile</DialogTitle>
          <DialogDescription>
            Business details, GSTIN, and Bank / UPI payment info used on invoices.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Business Info */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company / Store Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. WinTech Auto Spares" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownedBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proprietor / Signatory *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Jegan S" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registered Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="Shop No, Street, City, Pincode" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 98765 43210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField
                control={form.control}
                name="gstNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSTIN *</FormLabel>
                    <FormControl>
                      <Input placeholder="33AAAAA0000A1Z5" className="font-mono text-xs uppercase" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="Tamil Nadu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stateCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State Code</FormLabel>
                    <FormControl>
                      <Input placeholder="33" className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bank & UPI Section */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-primary" />
                Bank & UPI Details (For Invoice QR Code)
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Bank Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. State Bank of India" className="h-8 text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Account number" className="h-8 text-xs font-mono" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bankIfsc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">IFSC Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. SBIN0001234" className="h-8 text-xs font-mono uppercase" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="upiId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">UPI ID (For Scan & Pay)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. username@upi" className="h-8 text-xs font-mono" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Invoice Number Prefix */}
            <div className="grid grid-cols-2 gap-3 border rounded-lg p-3 text-xs">
              <FormField
                control={form.control}
                name="invoicePrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Invoice Prefix</FormLabel>
                    <FormControl>
                      <Input placeholder="INV-" className="h-8 text-xs font-mono" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceSuffix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Invoice Suffix</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. -26" className="h-8 text-xs font-mono" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {profile ? 'Save Changes' : 'Create Profile'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
