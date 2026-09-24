'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, PlusCircle, Star } from 'lucide-react';
import { ConfirmationDialog } from './alert-dialog';
import { CompanyProfileDialog } from './company-profile-dialog';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  deleteDocumentNonBlocking,
  setDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { CompanyProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export function CompanyProfileManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [profileToEdit, setProfileToEdit] = useState<CompanyProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<CompanyProfile | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  const firestore = useFirestore();
  const { toast } = useToast();

  const profilesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'companyProfiles') : null),
    [firestore]
  );
  const { data: profiles, isLoading } = useCollection<CompanyProfile>(profilesQuery);

  const handleOpenDialog = (profile: CompanyProfile | null = null) => {
    setProfileToEdit(profile);
    setIsDialogOpen(true);
  };

  const handleDelete = () => {
    if (!firestore || !profileToDelete) return;
    const docRef = doc(firestore, 'companyProfiles', profileToDelete.id);
    deleteDocumentNonBlocking(docRef);
    toast({
      title: 'Profile Deleted',
      description: `${profileToDelete.companyName} has been successfully deleted.`,
    });
    setIsConfirmOpen(false);
    setProfileToDelete(null);
  };

  const handleSetDefault = async (profileId: string) => {
    if (!firestore || !profiles) return;

    const batch = writeBatch(firestore);
    let newDefaultName = '';

    profiles.forEach((p) => {
      const profileRef = doc(firestore, 'companyProfiles', p.id);
      if (p.id === profileId) {
        batch.update(profileRef, { isDefault: true });
        newDefaultName = p.companyName;
      } else if (p.isDefault) {
        batch.update(profileRef, { isDefault: false });
      }
    });

    try {
      await batch.commit();
      toast({
        title: 'Default Profile Updated',
        description: `${newDefaultName} is now the default company profile.`,
      });
    } catch (error) {
      console.error('Error setting default profile:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to set default profile. Please try again.',
      });
    }
  };

  const openDeleteConfirmation = (profile: CompanyProfile) => {
    setProfileToDelete(profile);
    setIsConfirmOpen(true);
  };

  const renderSkeleton = () => (
    Array.from({ length: 2 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell>
          <Skeleton className="h-5 w-32" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-5 w-24" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-5 w-40" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-5 w-16" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-8 w-8" />
        </TableCell>
      </TableRow>
    ))
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Company Profiles</CardTitle>
            <CardDescription>
              Manage your business profiles. The default profile will be used on invoices.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => handleOpenDialog()}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add Profile
            </span>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Owned By</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && renderSkeleton()}
              {!isLoading && profiles?.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.companyName}</TableCell>
                  <TableCell>{profile.ownedBy}</TableCell>
                  <TableCell>{profile.gstNumber}</TableCell>
                  <TableCell>
                    {profile.isDefault && (
                      <Badge variant="outline" className="gap-1 pl-2">
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                        Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleOpenDialog(profile)}>
                          Edit
                        </DropdownMenuItem>
                        {!profile.isDefault && (
                           <DropdownMenuItem onClick={() => handleSetDefault(profile.id)}>
                             Set as Default
                           </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => openDeleteConfirmation(profile)}
                          className="text-red-600"
                           disabled={profile.isDefault}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CompanyProfileDialog 
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        profile={profileToEdit}
        isDefault={!!profileToEdit?.isDefault}
      />
      <ConfirmationDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        onConfirm={handleDelete}
        title="Are you sure you want to delete this profile?"
        description="This action cannot be undone. This will permanently delete the company profile."
      />
    </>
  );
}
