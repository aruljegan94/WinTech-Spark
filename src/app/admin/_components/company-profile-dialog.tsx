
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
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const companyProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  ownedBy: z.string().min(1, 'Owner name is required'),
  address: z.string().min(1, 'Address is required'),
  contact: z.string().min(1, 'Contact number is required'),
  gstNumber: z.string().min(1, 'GST number is required'),
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

export function CompanyProfileDialog({ isOpen, onOpenChange, profile, isDefault }: CompanyProfileDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      companyName: '',
      ownedBy: '',
      address: '',
      contact: '',
      gstNumber: '',
      isDefault: false,
      invoicePrefix: 'INV-',
      invoiceSuffix: '',
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset(profile);
    } else {
      form.reset({
        companyName: '',
        ownedBy: '',
        address: '',
        contact: '',
        gstNumber: '',
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
      // Editing existing profile
      const docRef = doc(firestore, 'companyProfiles', profile.id);
      setDocumentNonBlocking(docRef, data, { merge: true });
      toast({
        title: 'Profile Updated',
        description: 'The company profile has been successfully updated.',
      });
    } else {
      // Creating new profile
      const collectionRef = collection(firestore, 'companyProfiles');
      await addDocumentNonBlocking(collectionRef, data);
       toast({
        title: 'Profile Created',
        description: 'The new company profile has been successfully created.',
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{profile ? 'Edit' : 'Add'} Company Profile</DialogTitle>
          <DialogDescription>
            {profile ? 'Update the details of the company profile.' : 'Fill in the details for the new company profile.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Company LLC" {...field} />
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
                      <FormLabel>Owned By</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
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
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Anytown" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <FormField
                  control={form.control}
                  name="contact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 555-123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gstNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST Number</FormLabel>
                      <FormControl>
                        <Input placeholder="22AAAAA0000A1Z5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
             <div className="space-y-2 rounded-md border p-4">
                <h4 className="text-sm font-medium">Invoice Number Format</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                    control={form.control}
                    name="invoicePrefix"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Prefix</FormLabel>
                        <FormControl>
                            <Input placeholder="INV-" {...field} />
                        </FormControl>
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="invoiceSuffix"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Suffix</FormLabel>
                        <FormControl>
                            <Input placeholder="-2024" {...field} />
                        </FormControl>
                        </FormItem>
                    )}
                    />
                </div>
                <p className="text-xs text-muted-foreground">Example: {form.getValues('invoicePrefix')}001{form.getValues('invoiceSuffix')}</p>
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
