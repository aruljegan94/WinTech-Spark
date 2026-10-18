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

  // Global safeguard: prevent Radix Dialog / DropdownMenu / Select / Print Iframe from leaving
  // document.body stuck with `pointer-events: none` or `data-scroll-locked` after closing modals.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const unlockStaleBodyLocks = () => {
      const hasActiveModal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      if (!hasActiveModal) {
        if (document.body.style.pointerEvents === "none") {
          document.body.style.pointerEvents = "";
        }
        if (document.body.style.overflow === "hidden") {
          document.body.style.overflow = "";
        }
        if (document.body.hasAttribute("data-scroll-locked")) {
          document.body.removeAttribute("data-scroll-locked");
        }
      }
    };

    // Run on route changes
    unlockStaleBodyLocks();

    // Watch document.body style/attribute mutations
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (
        document.body.style.pointerEvents === "none" ||
        document.body.hasAttribute("data-scroll-locked")
      ) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(unlockStaleBodyLocks, 60);
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
    });

    window.addEventListener("afterprint", unlockStaleBodyLocks);
    window.addEventListener("focus", unlockStaleBodyLocks);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("afterprint", unlockStaleBodyLocks);
      window.removeEventListener("focus", unlockStaleBodyLocks);
    };
  }, [pathname]);

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
