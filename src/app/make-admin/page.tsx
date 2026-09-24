'use client';

import { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MakeAdminPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isUserLoading || !firestore) {
      return; // Wait for user and firestore to be available
    }

    if (!user) {
      setStatus('No user is logged in. Redirecting to login page...');
      setTimeout(() => router.push('/login'), 2000);
      return;
    }

    const makeAdmin = async () => {
      try {
        setStatus(`Found user: ${user.email}. Checking status...`);
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'Admin') {
            setStatus('You are already an admin. Redirecting...');
            setTimeout(() => router.push('/admin'), 1500);
          } else {
            setStatus('User found. Upgrading to Admin...');
            await updateDoc(userDocRef, { role: 'Admin' });
            setStatus('Success! You are now an administrator. Redirecting...');
            setTimeout(() => router.push('/admin'), 1500);
          }
        } else {
          // This case is unlikely if the signup process worked at all, but we handle it.
          setStatus('User profile not found in database. Creating and setting to Admin...');
          await setDoc(userDocRef, {
            email: user.email,
            name: user.displayName || 'Admin',
            role: 'Admin',
          });
          setStatus('Success! Your admin profile has been created. Redirecting...');
          setTimeout(() => router.push('/admin'), 1500);
        }
      } catch (e: any) {
        console.error('Failed to make user admin:', e);
        setError(`An error occurred: ${e.message}. You might need to check your Firestore security rules for the 'users' collection to ensure a user can write to their own document.`);
        setStatus('Operation failed.');
      }
    };

    makeAdmin();
  }, [user, isUserLoading, firestore, router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <h1 className="text-2xl font-bold">Admin Promotion Tool</h1>
      <div className="flex items-center gap-2 text-lg">
        {status !== 'Operation failed.' && <Loader2 className="h-6 w-6 animate-spin" />}
        <p>{status}</p>
      </div>
      {error && (
        <div className="max-w-md rounded-md border border-destructive bg-destructive/10 p-4 text-left text-sm text-destructive-foreground">
          <h3 className="font-bold">Error Details</h3>
          <p>{error}</p>
        </div>
      )}
      <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
    </div>
  );
}
