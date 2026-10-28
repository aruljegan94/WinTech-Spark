
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { UserManagement } from './_components/user-management';
import { CompanyProfileManagement } from './_components/company-profile-management';
import { WhatsappShareManagement } from './_components/whatsapp-share-management';
import { useUser } from '@/firebase';
import { Loader2 } from 'lucide-react';

export default function AdminPage() {
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, user, router]);

    if (isUserLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    
    if (!user) return null;

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
