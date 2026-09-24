"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuth } from "@/firebase";

export function useLogin() {
  const auth = useAuth();

  const login = async (email: string, password: string) => {
    if (!auth) {
      console.warn("Auth not ready yet");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("User signed in:", userCredential.user);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  return { login };
}
