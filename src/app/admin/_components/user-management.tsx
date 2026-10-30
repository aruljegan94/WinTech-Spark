
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
import { MoreHorizontal, PlusCircle, ShieldCheck, Crown, KeyRound, Sparkles, User, Mail, Calendar, Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddUserDialog } from './add-user-dialog';
import { EditUserDialog } from './edit-user-dialog'; // Import the new dialog
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useUser, useDoc, setDocumentNonBlocking, useAuth } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import type { User as UserType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

export function UserManagement() {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [userToEdit, setUserToEdit] = useState<UserType | null>(null);
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const { user: currentUser, isUserLoading: isAuthLoading } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentUser ? doc(firestore, 'users', currentUser.uid) : null),
    [firestore, currentUser]
  );
  
  const { data: currentUserDoc, isLoading: isCurrentUserDocLoading } = useDoc<UserType>(currentUserDocRef);
  
  const usersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );

  const { data: users, isLoading: isUsersLoading } = useCollection<UserType>(usersQuery);

  const isLoading = isAuthLoading || isUsersLoading;

  const isFirstUser = !isLoading && users?.length === 0;
  
  useEffect(() => {
    if (isFirstUser) {
        setIsAddUserDialogOpen(true);
    }
  }, [isFirstUser]);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const isOwnerUser = (user: UserType) => {
    const email = user.email?.toLowerCase().trim() || '';
    return user.isOwner || email === 'jeganwin4@gamil.com' || email === 'jeganwin4@gmail.com' || email.startsWith('jegan');
  };

  const handleSendPasswordReset = async (email: string) => {
    if (!auth || !email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: 'Reset Link Dispatched',
        description: `A password reset email has been sent to ${email}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
        description: err.message || 'Could not send password reset email.',
      });
    }
  };

  const handleMakeAdmin = () => {
    if (!firestore || !currentUser) return;
    const userRef = doc(firestore, 'users', currentUser.uid);
    setDocumentNonBlocking(userRef, { role: 'Admin' }, { merge: true });
    toast({
        title: 'Permissions Updated',
        description: 'You have been granted Administrator privileges.',
    });
  };

  const handleDeleteUser = () => {
    if (!firestore || !userToDelete) return;

    if (isOwnerUser(userToDelete)) {
      toast({
        variant: 'destructive',
        title: 'Action Forbidden',
        description: 'The primary owner account cannot be deleted.',
      });
      setUserToDelete(null);
      return;
    }

    if (currentUser && userToDelete.id === currentUser.uid) {
        toast({
            variant: 'destructive',
            title: 'Action Forbidden',
            description: 'You cannot delete your own active account.'
        });
        setUserToDelete(null);
        return;
    }

    const userRef = doc(firestore, 'users', userToDelete.id);
    deleteDocumentNonBlocking(userRef);

    toast({
      title: 'User Deleted',
      description: `${userToDelete.name} has been removed from the directory.`,
    });
    setUserToDelete(null);
  };
  
  const handleOpenAddUserDialog = () => {
      setIsAddUserDialogOpen(true);
  };

  const handleOpenEditDialog = (user: UserType) => {
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
                  <Skeleton className="h-4 w-28" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ));
      }

      if (users && users.length > 0) {
          return users.map((user) => {
            const isOwner = isOwnerUser(user);
            return (
              <TableRow key={user.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>{user.name}</span>
                        {isOwner && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium inline-flex items-center gap-0.5">
                            <Crown className="h-2.5 w-2.5" />
                            <span>Owner</span>
                          </Badge>
                        )}
                      </div>
                      {user.phoneNumber && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" />
                          <span>{user.phoneNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {user.email}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === 'Admin' ? 'destructive' : user.role === 'Editor' ? 'secondary' : 'outline'}
                    className="text-[11px] font-medium"
                  >
                    {user.role === 'Admin' && <ShieldCheck className="h-3 w-3 mr-1 inline" />}
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>
                    {user.createdAt ? format(new Date(user.createdAt), 'dd MMM yyyy') : '—'}
                  </div>
                  {user.createdByName && (
                    <div className="text-[10px] text-muted-foreground/80">
                      by {user.createdByName}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => handleOpenEditDialog(user)}>
                        Edit Profile & Role
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleSendPasswordReset(user.email)}>
                        <KeyRound className="h-3.5 w-3.5 mr-2 text-primary" />
                        <span>Send Password Reset</span>
                      </DropdownMenuItem>
                      {!isOwner && (
                        <DropdownMenuItem
                          onSelect={() => setUserToDelete(user)}
                          className="text-red-600 dark:text-red-400"
                          disabled={currentUser?.uid === user.id}
                        >
                          Delete User
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          });
      }
      
      if (isFirstUser) {
          return (
             <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Create the first admin user to get started.
                </TableCell>
            </TableRow>
          );
      }

      return null;
  };

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
                <TableHead>User & Contact</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>System Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[60px] text-right">
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
