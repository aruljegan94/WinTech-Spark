"use client";

import React, { useMemo, type ReactNode } from "react";
import { FirebaseProvider } from "@/firebase/provider";
import { initializeFirebase } from "@/firebase";

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return initializeFirebase();
  }, []);

  // ✅ ALWAYS render the provider
  return (
    <FirebaseProvider
      firebaseApp={firebaseServices?.firebaseApp ?? null}
      auth={firebaseServices?.auth ?? null}
      firestore={firebaseServices?.firestore ?? null}
    >
      {children}
    </FirebaseProvider>
  );
}
