"use client";

import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarClose,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/header";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Store,
  Users,
  ReceiptText,
  Wallet,
  FileSpreadsheet,
  TrendingUp,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  ClipboardList,
  Barcode,
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
import { AppLoadingBar } from "@/components/ui/app-loading-bar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const baseNavSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/sales", icon: ReceiptText, label: "Sales & Invoices" },
      { href: "/customers", icon: Users, label: "Customers" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/products", icon: Boxes, label: "Products" },
      { href: "/orders", icon: ClipboardList, label: "Orders" },
      { href: "/purchases", icon: ShoppingCart, label: "Purchases" },
      { href: "/vendors", icon: Store, label: "Vendors" },
    ],
  },
  {
    label: "Finance & Reports",
    items: [
      { href: "/expenses", icon: Wallet, label: "Expenses" },
      { href: "/reports", icon: FileSpreadsheet, label: "Reports" },
      { href: "/analysis", icon: TrendingUp, label: "Analysis" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", icon: Settings, label: "Settings" },
      { href: "/barcodes", icon: Barcode, label: "Barcode Labels" },
    ],
  },
];

const adminNavItem: NavItem = {
  href: "/admin",
  icon: ShieldCheck,
  label: "Admin Panel",
};

/**
 * Top brand header inside the sidebar.
 * When expanded: Shows Logo + Brand Name + Desktop Collapse Trigger.
 * When collapsed: Shows centered Logo squircle that expands sidebar on click!
 */
function SidebarHeaderBrand() {
  const { toggleSidebar, state } = useSidebar();
  const isExpanded = state === "expanded";

  if (!isExpanded) {
    return (
      <div className="flex w-full items-center justify-center py-1">
        <button
          onClick={toggleSidebar}
          type="button"
          title="Click to expand sidebar"
          className="relative h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-md ring-1 ring-white/15 bg-black flex items-center justify-center transition-all hover:ring-primary/60 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Image
            src="/AppLogo-icon.png"
            width={40}
            height={40}
            alt="Spark Logo"
            className="h-full w-full object-cover"
            priority
          />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 min-w-0 transition-transform active:scale-95"
      >
        <div className="relative h-9 w-9 rounded-xl overflow-hidden shrink-0 shadow-md ring-1 ring-black/10 dark:ring-white/15 bg-black flex items-center justify-center">
          <Image
            src="/AppLogo-icon.png"
            width={36}
            height={36}
            alt="Spark Logo"
            className="h-full w-full object-cover"
            priority
          />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-[15px] text-foreground font-sans">
              SPARK
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary uppercase tracking-wider border border-primary/20">
              PRO
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground truncate">
            Billing & Payments
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          type="button"
          title="Collapse Sidebar"
          className="hidden md:flex h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-md"
        >
          <PanelLeft className="size-4" />
          <span className="sr-only">Collapse Sidebar</span>
        </Button>
        <div className="md:hidden">
          <SidebarClose />
        </div>
      </div>
    </div>
  );
}

/**
 * Bottom collapse/expand toggle button.
 * Always accessible in both expanded and collapsed states.
 */
function SidebarCollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const isExpanded = state === "expanded";

  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      tooltip={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
      className="w-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors h-9 rounded-lg"
    >
      <div className="flex items-center gap-2.5 w-full group-data-[collapsible=icon]:justify-center">
        {isExpanded ? (
          <>
            <ChevronLeft className="size-[18px] shrink-0 text-muted-foreground transition-transform" />
            <span className="font-medium text-[13px] truncate">Collapse Sidebar</span>
          </>
        ) : (
          <ChevronRight className="size-[18px] shrink-0 text-muted-foreground transition-transform" />
        )}
      </div>
    </SidebarMenuButton>
  );
}

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

  const navSections = useMemo(() => {
    if (!isAdmin) return baseNavSections;
    return baseNavSections.map((section) => {
      if (section.label === "System") {
        return {
          ...section,
          items: [...section.items, adminNavItem],
        };
      }
      return section;
    });
  }, [isAdmin]);

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
    return <AppLoadingBar message="Loading workspace..." />;
  }

  if (!user) {
    return <AppLoadingBar message="Redirecting to login..." isComplete={true} />;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar collapsible="icon">
          {/* Header with App Logo and Brand identity */}
          <SidebarHeader className="flex items-center px-3 py-3 border-b border-border/70 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:justify-center">
            <SidebarHeaderBrand />
          </SidebarHeader>

          {/* Navigation Items grouped by domain with matte styling */}
          <SidebarContent className="px-2 py-2 overflow-y-auto space-y-1 group-data-[collapsible=icon]:px-1">
            {navSections.map((section) => (
              <SidebarGroup key={section.label} className="py-0.5">
                <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2.5 mb-1 group-data-[collapsible=icon]:hidden">
                  {section.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-0.5">
                    {section.items.map((link) => {
                      const isActive =
                        link.href === "/dashboard"
                          ? pathname === "/dashboard" || pathname === "/"
                          : pathname.startsWith(link.href);

                      return (
                        <SidebarMenuItem key={link.href}>
                          <SidebarMenuButton
                            asChild
                            tooltip={link.label}
                            isActive={isActive}
                            className={cn(
                              "h-9 rounded-lg font-medium text-[13.5px] transition-all duration-150 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 hover:text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                            )}
                          >
                            <Link href={link.href} className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center w-full">
                              <link.icon
                                className={cn(
                                  "size-[18px] shrink-0 transition-transform duration-150",
                                  isActive
                                    ? "text-primary-foreground"
                                    : "text-muted-foreground group-hover/menu-item:text-foreground"
                                )}
                              />
                              <span className="truncate group-data-[collapsible=icon]:hidden">{link.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          {/* Sidebar Footer with Status, Collapse Button, and Logout */}
          <SidebarFooter className="p-2 border-t border-border/70 mt-auto">
            {/* Online Status (only in expanded mode) */}
            <div className="group-data-[collapsible=icon]:hidden flex items-center justify-between px-2.5 py-1.5 mb-1 rounded-lg bg-muted/40 border border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-[11px] font-medium text-muted-foreground truncate">
                  {currentUser?.role || "Admin"} • Online
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60">v1.2</span>
            </div>

            <SidebarMenu className="space-y-0.5">
              {/* Expand / Collapse Toggle button */}
              <SidebarMenuItem>
                <SidebarCollapseToggle />
              </SidebarMenuItem>

              {/* Logout Button */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Logout"
                  className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors h-9 rounded-lg group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                >
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full text-left group-data-[collapsible=icon]:justify-center"
                  >
                    <LogOut className="size-[18px] shrink-0 text-destructive/80" />
                    <span className="group-data-[collapsible=icon]:hidden font-medium text-[13px]">
                      Logout
                    </span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <AppHeader user={currentUser} />
          <main className="flex-1 overflow-y-auto px-3 py-2 flex flex-col min-h-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
