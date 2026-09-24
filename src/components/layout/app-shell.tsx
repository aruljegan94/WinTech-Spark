"use client";

import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarClose,
} from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/header";
import {
  Home,
  Package2,
  Truck,
  Building2,
  CreditCard,
  ShoppingBag,
  FileText,
  Users,
  LogOut,
  BarChartBig,
  Settings,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  useAuth,
  useUser,
  useDoc,
  useFirestore,
  useMemoFirebase,
} from "@/firebase";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo } from "react";
import { doc, setDoc } from "firebase/firestore";
import type { User } from "@/lib/types";
import { Icons } from "@/components/icons";

const baseNavLinks = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/products", icon: Package2, label: "Products" },
  { href: "/purchases", icon: Truck, label: "Purchases" },
  { href: "/vendors", icon: Building2, label: "Vendors" },
  { href: "/sales", icon: CreditCard, label: "Sales" },
  { href: "/expenses", icon: ShoppingBag, label: "Expenses" },
  { href: "/reports", icon: FileText, label: "Reports" },
  { href: "/analysis", icon: BarChartBig, label: "Analysis" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

const adminNavLink = { href: "/admin", icon: Users, label: "Admin" };

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const userRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, "users", user.uid) : null),
    [firestore, user]
  );

  const { data: currentUser, isLoading } = useDoc<User>(userRef);

  useEffect(() => {
    if (firestore && user && !isLoading && !currentUser) {
      const userDocRef = doc(firestore, "users", user.uid);
      setDoc(
        userDocRef,
        {
          email: user.email || "",
          name: user.displayName || user.email?.split("@")[0] || "Admin",
          role: "Admin",
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch((err) =>
        console.error("Error auto-creating user profile:", err)
      );
    }
  }, [firestore, user, isLoading, currentUser]);

  const isAdmin = useMemo(
    () => !currentUser || currentUser?.role === "Admin",
    [currentUser]
  );

  const navLinks = [...baseNavLinks, adminNavLink];

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace("/login");
    }
  }, [user, isUserLoading, router]);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push("/login");
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.logo className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-muted/40">
        <Sidebar collapsible="icon">
          <SidebarHeader className="flex items-center justify-between p-4 border-b border-border/50">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 font-bold"
            >
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  width={22}
                  height={22}
                  alt="Logo"
                  className="h-5 w-5 object-contain"
                />
              </div>
              <span className="group-data-[collapsible=icon]:hidden font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#F62440] to-rose-500 text-base">
                WinTech-Spark
              </span>
            </Link>
            <div className="md:hidden">
              <SidebarClose />
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 py-3">
            <SidebarMenu className="flex-1 space-y-1">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={link.label}
                      isActive={isActive}
                      className={isActive ? "bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90 hover:text-primary-foreground" : ""}
                    >
                      <Link href={link.href} className="flex items-center gap-3">
                        <link.icon className={isActive ? "text-primary-foreground" : "text-primary"} />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <SidebarMenu className="pt-4 border-t border-border/50">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive gap-3"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-1 flex-col">
          <AppHeader user={currentUser} />
          <main className="flex-1 overflow-y-auto p-4">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
