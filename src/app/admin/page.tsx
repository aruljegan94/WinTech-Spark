
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { UserManagement } from './_components/user-management';
import { CompanyProfileManagement } from './_components/company-profile-management';
import { WhatsappShareManagement } from './_components/whatsapp-share-management';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AdminPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const userDocRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
    );
    const { data: currentUserDoc, isLoading: isDocLoading } = useDoc<User>(userDocRef);

    const isOwnerOrAdmin = useMemo(() => {
      if (!user) return false;
      const e = user.email?.toLowerCase().trim() || '';
      if (e === 'jeganwin4@gamil.com' || e === 'jeganwin4@gmail.com' || e.startsWith('jegan')) return true;
      return currentUserDoc?.role === 'Admin';
    }, [user, currentUserDoc]);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, user, router]);

    if (isUserLoading || isDocLoading) {
      return (
        <div className="flex h-[60vh] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    
    if (!user) return null;

    if (!isOwnerOrAdmin) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Admin Privileges Required</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Your account ({user.email}) currently has <strong>{currentUserDoc?.role || 'Viewer'}</strong> access. Only administrators can access user management and system settings.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </div>
      );
    }

    return (
        <>
          <PageHeader
            title="Admin & Settings"
            description="Manage users, company profiles, and WhatsApp cash flow sharing."
          />
          <Tabs defaultValue="users" className="mt-4">
            <TabsList className="grid w-full grid-cols-3 md:w-[550px]">
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="company">Company Profile</TabsTrigger>
              <TabsTrigger value="whatsapp">Whatsapp Share</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
            <TabsContent value="company">
              <CompanyProfileManagement />
            </TabsContent>
            <TabsContent value="whatsapp">
              <WhatsappShareManagement />
            </TabsContent>
          </Tabs>
        </>
    );
}
