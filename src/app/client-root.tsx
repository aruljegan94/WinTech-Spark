"use client";

import { FirebaseClientProvider, useUser } from "@/firebase";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import AppShell from "@/components/layout/app-shell";
import { AppLoadingBar } from "@/components/ui/app-loading-bar";

function InnerApp({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    // If auth state resolved and no user logged in, immediately redirect to /login
    if (!isUserLoading && !user && !isLoginRoute) {
      router.replace("/login");
    }
  }, [isUserLoading, user, isLoginRoute, router]);

  // Login page renders directly
  if (isLoginRoute) {
    return <>{children}</>;
  }

  // Show the red & white loading bar with percentage during startup
  if (isUserLoading) {
    return <AppLoadingBar message="Starting WinTech-Spark..." />;
  }

  // If unauthenticated and redirecting to /login, show loader smoothly instead of blank screen
  if (!user) {
    return <AppLoadingBar message="Redirecting to login..." isComplete={true} />;
  }

  return <AppShell>{children}</AppShell>;
}

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <InnerApp>{children}</InnerApp>
    </FirebaseClientProvider>
  );
}
