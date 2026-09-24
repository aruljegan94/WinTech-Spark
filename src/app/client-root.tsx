"use client";

import { FirebaseClientProvider, useUser } from "@/firebase";
import { usePathname } from "next/navigation";
import AppShell from "@/components/layout/app-shell";
import { Icons } from "@/components/icons";

function InnerApp({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isUserLoading } = useUser();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.logo className="h-8 w-8 animate-spin" />
      </div>
    );
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
