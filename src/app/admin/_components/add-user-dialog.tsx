
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, useAuth, useUser } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile, signOut, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { Loader2 } from 'lucide-react';
import type { User } from '@/lib/types';
import { useEffect } from 'react';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['Admin', 'Editor', 'Viewer']),
});

type UserFormValues = z.infer<typeof userSchema>;

interface AddUserDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isFirstUser: boolean;
}

export function AddUserDialog({ isOpen, onOpenChange, isFirstUser }: AddUserDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user: currentUser } = useUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      password: '',
      role: isFirstUser ? 'Admin' : 'Viewer',
    },
  });
  
  useEffect(() => {
    if (isOpen) { // Reset form only when dialog opens
      form.reset({
        name: '',
        email: '',
        phoneNumber: '',
        password: '',
        role: isFirstUser ? 'Admin' : 'Viewer',
      });
    }
  }, [isOpen, isFirstUser, form]);


  const { isSubmitting } = form.formState;

  const onSubmit = async (data: UserFormValues) => {
    if (!firestore || !auth) return;

    // If first user, register directly into primary auth so they become logged in
    if (isFirstUser) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const authUser = userCredential.user;
        try {
          await updateProfile(authUser, { displayName: data.name });
        } catch (_) {}

        const userDocRef = doc(firestore, 'users', authUser.uid);
        const userData: Omit<User, 'id'> = {
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber || '',
          role: 'Admin',
          createdAt: new Date().toISOString(),
          isOwner: true,
        };

        await setDoc(userDocRef, userData);

        toast({
          title: 'Admin Created',
          description: `Admin ${data.name} has been successfully created.`,
        });
        onOpenChange(false);
      } catch (error: any) {
        console.error('Error creating admin user:', error);
        let errorMessage = error.message || 'Failed to create user.';
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = 'This email address is already in use by another account.';
        }
        toast({
          variant: 'destructive',
          title: 'Error',
          description: errorMessage,
        });
      }
      return;
    }

    // Secondary app instance creation so current admin session is NOT signed out!
    const tempAppName = `user-creator-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, data.password);
      const authUser = userCredential.user;

      try {
        await updateProfile(authUser, { displayName: data.name });
      } catch (_) {}

      const userDocRef = doc(firestore, 'users', authUser.uid);
      const userData: Omit<User, 'id'> = {
        name: data.name,
        email: data.email,
        phoneNumber: data.phoneNumber || '',
        role: data.role,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || '',
        createdByName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Admin',
      };

      await setDoc(userDocRef, userData);
      await signOut(tempAuth);

      toast({
        title: 'User Created Successfully',
        description: `User "${data.name}" (${data.role}) created. You remain logged in as Admin.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating user:', error);
      let errorMessage = error.message || 'Failed to create user.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email address is already in use by another account.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      }
      toast({
        variant: 'destructive',
        title: 'Failed to create user',
        description: errorMessage,
      });
    } finally {
      try {
        await deleteApp(tempApp);
      } catch (delErr) {
        console.warn('Error deleting temp firebase app:', delErr);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isFirstUser ? 'Create Admin Account' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isFirstUser
              ? 'This will be the primary administrator account.'
              : 'Fill in the details to create a new user account.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+1234567890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
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
                  <FormLabel>Role</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isFirstUser}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Editor">Editor</SelectItem>
                      <SelectItem value="Viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
