'use client';

import { useEffect, useRef, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  addDocumentNonBlocking,
  setDocumentNonBlocking,
  useUser,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, addDoc, updateDoc } from 'firebase/firestore';
import type { Expense, User } from '@/lib/types';
import { Loader2, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const expenseSchema = z.object({
  date: z.date({ required_error: 'An expense date is required.' }),
  expenseType: z.string().min(1, 'Expense type is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  notes: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

interface ExpenseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}

const expenseTypes = ['Rent', 'Electricity', 'Transport', 'Supplies', 'Salaries', 'Miscellaneous'];

export function ExpenseDialog({ isOpen, onOpenChange, expense }: ExpenseDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentAuthUser } = useUser();
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentAuthUser ? doc(firestore, 'users', currentAuthUser.uid) : null),
    [firestore, currentAuthUser]
  );
  const { data: currentUserDoc } = useDoc<User>(currentUserDocRef);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      expenseType: '',
      amount: 0,
      notes: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (expense) {
        form.reset({
          ...expense,
          date: new Date(expense.date),
        });
      } else {
        form.reset({
          date: new Date(),
          expenseType: '',
          amount: 0,
          notes: '',
        });
      }
    }
  }, [isOpen, expense, form]);

  const { isSubmitting } = form.formState;
  const isSubmittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (data: ExpenseFormValues) => {
    if (!firestore) return;
    if (isSubmittingRef.current || submitting || isSubmitting) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      const currentUserName = currentUserDoc?.name || currentAuthUser?.displayName || currentAuthUser?.email?.split('@')[0] || 'Admin';

      if (expense) {
        // Editing existing expense
        const docRef = doc(firestore, 'expenses', expense.id);
        const updateData = {
          ...data,
          date: data.date.toISOString(),
          updatedBy: currentAuthUser?.uid || '',
          updatedByName: currentUserName,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(docRef, updateData);
        toast({
          title: 'Expense Updated',
          description: 'The expense has been successfully updated.',
        });
      } else {
        // Creating new expense
        const collectionRef = collection(firestore, 'expenses');
        const createData = {
          ...data,
          date: data.date.toISOString(),
          createdBy: currentAuthUser?.uid || '',
          createdByName: currentUserName,
          createdAt: new Date().toISOString(),
        };
        await addDoc(collectionRef, createData);
        toast({
          title: 'Expense Added',
          description: 'The new expense has been successfully recorded.',
        });
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving expense:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to save expense.',
      });
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit' : 'Add'} Expense</DialogTitle>
          <DialogDescription>
            {expense ? 'Update the details of the expense.' : 'Fill in the details for the new expense.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expense Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        disabled={(date) => date > new Date() || date < new Date('2000-01-01')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" min="0" placeholder="0.00" className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="expenseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expense Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an expense type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {expenseTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Office supplies for Q3" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || isSubmitting}>
                {(submitting || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {expense ? 'Save Changes' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
