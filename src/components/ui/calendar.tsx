"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      numberOfMonths={1}
      className={cn(
        "rounded-md border bg-background p-3 shadow-sm",
        className
      )}
      classNames={{
        months: "flex flex-col",
        month: "space-y-4",
        caption: "flex items-center justify-between px-1",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 p-0"
        ),
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7",
        head_cell:
          "text-center text-xs font-medium text-muted-foreground",
        row: "grid grid-cols-7 mt-1",
        cell: "flex items-center justify-center",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal"
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary",
        day_today:
          "border border-primary text-primary",
        day_outside:
          "text-muted-foreground opacity-50",
        day_disabled:
          "text-muted-foreground opacity-40",
        day_hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
export { Calendar };
