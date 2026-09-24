'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Bell, Loader2, FileWarning, Archive, Inbox, Sparkles, Wallet, TrendingUp, PartyPopper, FileText, CheckCircle2, Gift
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, useUser } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch, getDocs } from 'firebase/firestore';
import type { Notification, Sale, Product, Purchase, Vendor, Employee } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, differenceInDays, parseISO, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NotificationCenter() {
  const [isGenerating, setIsGenerating] = useState(false);
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const notificationsQuery = useMemoFirebase(
    () => (firestore && user ? query(collection(firestore, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc')) : null),
    [firestore, user]
  );
  const { data: notifications, isLoading } = useCollection<Notification>(notificationsQuery);

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  const handleGenerateNotifications = async () => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Data not ready',
        description: 'Authentication or database not ready.',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const [salesSnap, productsSnap, purchasesSnap, vendorsSnap, employeesSnap] = await Promise.all([
        getDocs(collection(firestore, 'sales')),
        getDocs(collection(firestore, 'products')),
        getDocs(collection(firestore, 'purchases')),
        getDocs(collection(firestore, 'vendors')),
        getDocs(collection(firestore, 'employees')),
      ]);

      const sales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Sale[];
      const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[];
      const purchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Purchase[];
      const vendors = vendorsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Vendor[];
      const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Employee[];

      const generated: Omit<Notification, 'id'>[] = [];
      const today = new Date();

      // 1. Pending to be Paid (Purchases & Vendor balances)
      purchases.forEach((p) => {
        const paid = p.amountPaid ?? (p.paymentStatus === 'Paid' ? p.totalAmount : 0);
        const pending = Math.max(0, p.totalAmount - paid);
        if (pending > 0) {
          let dueMsg = '';
          if (p.dueDate) {
            const daysLeft = differenceInDays(parseISO(p.dueDate), today);
            if (daysLeft < 0) {
              dueMsg = ` (Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) > 1 ? 's' : ''})`;
            } else if (daysLeft <= 3) {
              dueMsg = ` (Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'})`;
            }
          }
          generated.push({
            type: 'payment_to_pay',
            category: 'payment_due',
            message: `Pending Payment: ₹${pending.toLocaleString()} to ${p.supplierName} for Inv #${p.invoiceNo}${dueMsg}.`,
            referenceId: p.id,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      });

      // 2. Payment to be Received (Sales Invoices)
      sales.forEach((s) => {
        if (s.paymentStatus !== 'Paid') {
          const paid = s.amountPaid ?? 0;
          const pending = Math.max(0, s.total - paid);
          if (pending > 0) {
            generated.push({
              type: 'payment_to_receive',
              category: 'receivable',
              message: `Payment Receivable: ₹${pending.toLocaleString()} from ${s.customerName || 'Customer'} (Inv #${s.invoiceNumber}).`,
              referenceId: s.id,
              isRead: false,
              createdAt: new Date().toISOString(),
            });
          }
        }
      });

      // 3. Employee Birthday Reminders
      employees.forEach((emp) => {
        if (emp.dateOfBirth) {
          try {
            const dob = parseISO(emp.dateOfBirth);
            const thisYearBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
            const nextBday = thisYearBday < today ? new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate()) : thisYearBday;
            const daysLeft = differenceInDays(nextBday, today);

            if (daysLeft === 0) {
              generated.push({
                type: 'birthday',
                category: 'birthday',
                message: `🎉 Today is ${emp.name}'s Birthday! Send your best wishes.`,
                referenceId: emp.id,
                isRead: false,
                createdAt: new Date().toISOString(),
              });
            } else if (daysLeft <= 3) {
              generated.push({
                type: 'birthday',
                category: 'birthday',
                message: `🎂 ${emp.name}'s Birthday is coming up in ${daysLeft} day${daysLeft > 1 ? 's' : ''} (${format(nextBday, 'dd MMM')}).`,
                referenceId: emp.id,
                isRead: false,
                createdAt: new Date().toISOString(),
              });
            }
          } catch (e) {
            // Ignore invalid date strings
          }
        }
      });

      // 4. Monthly GST Filing Reminder (20th of every month)
      const currentDay = today.getDate();
      if (currentDay >= 15 && currentDay <= 20) {
        const gstDueDate = new Date(today.getFullYear(), today.getMonth(), 20);
        const daysLeft = differenceInDays(gstDueDate, today);
        generated.push({
          type: 'gst_reminder',
          category: 'gst',
          message: `📊 Monthly GST Return Filing is due on ${format(gstDueDate, '20-MMM-yyyy')}${daysLeft === 0 ? ' (Today!)' : ` (${daysLeft} day${daysLeft > 1 ? 's' : ''} left)`}.`,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      // 5. Low Stock Alerts
      products.forEach((prod) => {
        if (prod.stockQuantity <= 5) {
          generated.push({
            type: 'low_stock',
            category: 'stock',
            message: `⚠️ Low Stock Alert: ${prod.productName} has only ${prod.stockQuantity} unit(s) remaining!`,
            referenceId: prod.id,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      });

      if (generated.length === 0) {
        toast({ title: 'All caught up!', description: 'No pending alerts or notifications found.' });
        return;
      }

      // Write newly generated notifications to user's subcollection
      const batch = writeBatch(firestore);
      generated.forEach((notif) => {
        const notifRef = doc(collection(firestore, 'users', user.uid, 'notifications'));
        batch.set(notifRef, notif);
      });
      await batch.commit();

      toast({
        title: 'Alerts & Reminders Generated',
        description: `Generated ${generated.length} pending alert(s).`,
      });
    } catch (error) {
      console.error('Failed to generate notifications:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not generate notifications.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkAsRead = (id: string, isRead: boolean) => {
    if (!firestore || !user) return;
    const notifRef = doc(firestore, 'users', user.uid, 'notifications', id);
    setDocumentNonBlocking(notifRef, { isRead: isRead }, { merge: true });
  };

  const handleMarkAllAsRead = () => {
    if (!firestore || !user || !notifications) return;
    const batch = writeBatch(firestore);
    notifications.forEach((notif) => {
      if (!notif.isRead) {
        const notifRef = doc(firestore, 'users', user.uid, 'notifications', notif.id);
        batch.update(notifRef, { isRead: true });
      }
    });
    batch.commit();
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'payment_to_pay':
        return <Wallet className="h-4 w-4 text-amber-500" />;
      case 'payment_to_receive':
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'birthday':
        return <PartyPopper className="h-4 w-4 text-pink-500" />;
      case 'gst_reminder':
        return <FileText className="h-4 w-4 text-indigo-500" />;
      case 'low_stock':
        return <Archive className="h-4 w-4 text-red-500" />;
      case 'overdue_invoice':
        return <FileWarning className="h-4 w-4 text-orange-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const handleNotificationClick = (notif: Notification) => {
    handleMarkAsRead(notif.id, true);
    if (!notif.referenceId) return;

    if (notif.type === 'payment_to_pay' || notif.type === 'overdue_invoice') {
      router.push('/purchases');
    } else if (notif.type === 'payment_to_receive') {
      router.push('/sales');
    } else if (notif.type === 'low_stock') {
      router.push('/products');
    } else if (notif.type === 'birthday') {
      router.push('/settings');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0 text-[10px]">
              {unreadCount}
            </Badge>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-84 sm:w-96">
        <div className="flex items-center justify-between p-2">
          <DropdownMenuLabel className="font-bold flex items-center gap-1.5 text-sm">
            <Bell className="h-4 w-4 text-primary" /> Alerts & Reminders
          </DropdownMenuLabel>
          <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} disabled={unreadCount === 0} className="text-xs">
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[320px]">
          {isLoading && (
            <DropdownMenuItem className="flex justify-center items-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </DropdownMenuItem>
          )}
          {!isLoading && (notifications || []).length === 0 && (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm font-medium">All clear! No alerts.</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Scan & Scan Alerts" to scan for upcoming payments & birthdays.</p>
            </div>
          )}
          {!isLoading &&
            (notifications || []).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className={`flex items-start gap-2.5 p-2.5 cursor-pointer rounded-lg m-1 ${!notif.isRead ? 'bg-primary/5 font-medium border-l-2 border-primary' : ''}`}
                onSelect={(e) => {
                  e.preventDefault();
                  handleNotificationClick(notif);
                }}
              >
                <div className="mt-0.5 p-1 rounded-md bg-muted">{getIcon(notif.type)}</div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-xs leading-snug">{notif.message}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(parseISO(notif.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!notif.isRead && <div className="h-2 w-2 rounded-full bg-primary mt-1 flex-shrink-0" />}
              </DropdownMenuItem>
            ))}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="p-1.5">
          <Button className="w-full gap-2 text-xs" size="sm" onClick={handleGenerateNotifications} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Scan & Generate All Reminders
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
