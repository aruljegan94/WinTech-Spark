'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from './theme-toggle';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { useState, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { NotificationCenter } from '../notifications/notification-center';

// Isolated clock component — re-renders every second but doesn't propagate to AppHeader
const LiveClock = memo(function LiveClock() {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="text-xs text-muted-foreground">
      {format(currentDateTime, 'eeee, dd-MMM-yyyy | hh:mm:ss a')}
    </p>
  );
});

interface AppHeaderProps {
  user: User | null;
}

export function AppHeader({ user: currentUserDoc }: AppHeaderProps) {
  const auth = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <SidebarTrigger className="md:hidden" />
      
      <div className="hidden md:flex flex-col">
        <h1 className="text-lg font-semibold">Welcome, {currentUserDoc?.name || 'User'}!</h1>
        <LiveClock />
      </div>

      <div className="relative ml-auto flex items-center gap-2 md:grow-0">
        <ThemeToggle />
         <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="overflow-hidden rounded-full h-9 w-9"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{getInitials(currentUserDoc?.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{currentUserDoc?.name || 'My Account'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
