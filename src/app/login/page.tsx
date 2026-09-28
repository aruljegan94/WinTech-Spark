'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { AppLoadingBar } from '@/components/ui/app-loading-bar';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!auth) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Authentication service is not available.',
      });
      setIsLoading(false);
      return;
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in FirebaseProvider will handle the redirect
      toast({
        title: 'Success',
        description: 'Logged in successfully.',
      });
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Login Error:', error);
      let description = 'An unexpected error occurred. Please try again.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        description = 'Invalid email or password.';
      }
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle the case where someone navigates to /login but they are already logged in.
  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  // Show a loading state while checking auth status.
  // This also prevents a flash of the login form if the user is already logged in.
  if (isUserLoading) {
    return <AppLoadingBar message="Verifying session..." />;
  }
  
  // Only show the login page if there's no user and auth is not loading.
  if (!user && !isUserLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Card className="mx-auto max-w-sm">
          <CardHeader className="text-center">
            <div className="mb-4 flex items-center justify-center gap-2">
              <Image src="/logo.png" width={32} height={32} alt="App Logo" className="h-8 w-8" />
              <CardTitle className="text-3xl">WinTech-Spark</CardTitle>
            </div>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="#"
                      className="ml-auto inline-block text-sm underline"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default return, though the logic above should cover all cases.
  return null;
}
