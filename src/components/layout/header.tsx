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
import { GlobalSearch } from './global-search';

// Isolated clock component — re-renders every second but doesn't propagate to AppHeader
const LiveClock = memo(function LiveClock() {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="text-[10px] text-muted-foreground tracking-wide">
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
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-card px-3 sm:px-4">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      
      <div className="hidden md:flex flex-col leading-none">
        <h1 className="text-sm font-semibold tracking-tight">Welcome, {currentUserDoc?.name || 'User'}</h1>
        <LiveClock />
      </div>

      <div className="relative ml-auto flex items-center gap-2">
        <GlobalSearch />
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
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              Settings & Profile
            </DropdownMenuItem>
            {currentUserDoc?.role === 'Admin' && (
              <DropdownMenuItem onClick={() => router.push('/admin')}>
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
