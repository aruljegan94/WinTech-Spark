
'use client';

import { useState, useEffect } from 'react';
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
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, PlusCircle, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddUserDialog } from './add-user-dialog';
import { EditUserDialog } from './edit-user-dialog'; // Import the new dialog
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useUser, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export function UserManagement() {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false); // State for edit dialog
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null); // State for user being edited
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user: currentUser, isUserLoading: isAuthLoading } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  
  const { data: currentUserDoc, isLoading: isCurrentUserDocLoading } = useDoc<User>(currentUserDocRef);
  
  const usersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );

  const { data: users, isLoading: isUsersLoading } = useCollection<User>(usersQuery);

  const isLoading = isAuthLoading || isUsersLoading;

  const isFirstUser = !isLoading && users?.length === 0;
  
  useEffect(() => {
    if (isFirstUser) {
        setIsAddUserDialogOpen(true);
    }
  }, [isFirstUser]);


  const getInitials = (name: string) => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const handleMakeAdmin = () => {
    if (!firestore || !currentUser) return;
    const userRef = doc(firestore, 'users', currentUser.uid);
    setDocumentNonBlocking(userRef, { role: 'Admin' }, { merge: true });
    toast({
        title: 'Permissions Updated',
        description: 'You have been granted Administrator privileges. The page will now refresh.',
    });
  }

  const handleDeleteUser = () => {
    if (!firestore || !userToDelete) return;

    if (currentUser && userToDelete.id === currentUser.uid) {
        toast({
            variant: 'destructive',
            title: 'Action Forbidden',
            description: 'You cannot delete your own account.'
        });
        setUserToDelete(null);
        return;
    }

    const userRef = doc(firestore, 'users', userToDelete.id);
    deleteDocumentNonBlocking(userRef);

    toast({
      title: 'User Deleted',
      description: `${userToDelete.name} has been removed from the list.`,
    });
    setUserToDelete(null);
  };
  
  const handleOpenAddUserDialog = () => {
      setIsAddUserDialogOpen(true);
  }

  const handleOpenEditDialog = (user: User) => {
    setUserToEdit(user);
    setIsEditUserDialogOpen(true);
  };


  const renderTableContent = () => {
      if (isLoading) {
          return Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ));
      }

      if (users && users.length > 0) {
          return users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  <Avatar className="hidden h-9 w-9 sm:flex">
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  {user.name}
                </div>
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge
                  variant={user.role === 'Admin' ? 'destructive' : 'outline'}
                >
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-haspopup="true" size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => handleOpenEditDialog(user)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setUserToDelete(user)}
                      className="text-red-600"
                      disabled={currentUser?.uid === user.id}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ));
      }
      
      if (isFirstUser) {
          return (
             <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Create the first admin user to get started.
                </TableCell>
            </TableRow>
          )
      }

      return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              {isFirstUser 
                ? 'No users found. Create the first admin user.' 
                : 'A list of all users with access to the system.'
              }
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="gap-1"
            onClick={handleOpenAddUserDialog}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              {isFirstUser ? 'Create Admin' : 'Add User'}
            </span>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderTableContent()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AddUserDialog
        isOpen={isAddUserDialogOpen}
        onOpenChange={setIsAddUserDialogOpen}
        isFirstUser={isFirstUser}
      />
      {userToEdit && (
        <EditUserDialog
          isOpen={isEditUserDialogOpen}
          onOpenChange={setIsEditUserDialogOpen}
          user={userToEdit}
        />
      )}
      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user "{userToDelete?.name}". This action only removes the user from the list, not their login access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
