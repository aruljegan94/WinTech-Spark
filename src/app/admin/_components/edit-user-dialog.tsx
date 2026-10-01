'use client';

import { useEffect, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, useAuth, useUser } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { Loader2, UserCheck } from 'lucide-react';
import type { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phoneNumber: z.string().optional(),
  role: z.enum(['Admin', 'Editor', 'Viewer']),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface EditUserDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export function EditUserDialog({ isOpen, onOpenChange, user }: EditUserDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
      role: 'Viewer',
    },
  });

  useEffect(() => {
    if (user && isOpen) {
      form.reset({
        name: user.name || '',
        phoneNumber: user.phoneNumber || '',
        role: user.role || 'Viewer',
      });
    }
  }, [user, form, isOpen]);

  const onSubmit = async (data: EditUserFormValues) => {
    if (!firestore || !user?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'User record or database connection missing.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const userDocRef = doc(firestore, 'users', user.id);
      const updatedData: Partial<User> = {
        name: data.name.trim(),
        phoneNumber: data.phoneNumber?.trim() || '',
        role: data.role,
      };

      // 1. Persist to Firestore users document
      await setDoc(userDocRef, updatedData, { merge: true });

      // 2. If editing the currently authenticated user, update Firebase Auth profile too
      if (auth?.currentUser && auth.currentUser.uid === user.id) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: data.name.trim(),
          });
        } catch (authErr) {
          console.warn('Auth displayName update warning:', authErr);
        }
      }

      toast({
        title: 'User Updated Successfully',
        description: `Name updated to "${data.name.trim()}".`,
      });

      onOpenChange(false);
      router.refresh();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || 'Failed to update user. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <div className="p-1.5 rounded-md bg-primary/10">
              <UserCheck className="h-4 w-4" />
            </div>
            <DialogTitle>Edit User Profile</DialogTitle>
          </div>
          <DialogDescription>
            Update name, phone number, and access permissions for <strong>{user?.name || user?.email}</strong>.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <Input
                value={user?.email || ''}
                disabled
                className="cursor-not-allowed bg-muted/60 text-muted-foreground font-mono text-xs"
              />
            </FormItem>

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. +91 98765 43210" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role & Permissions *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Admin">Admin (Full Access & Settings)</SelectItem>
                      <SelectItem value="Editor">Editor (Sales, Purchases, Inventory)</SelectItem>
                      <SelectItem value="Viewer">Viewer (Read Only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-w-[100px]">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
