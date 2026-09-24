'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null; // or a loading spinner
}
