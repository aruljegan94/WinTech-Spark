"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
      className={cn("p-3 select-none", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-3 relative",
        month_caption: "flex justify-center items-center h-8 relative px-8",
        caption_label: "text-sm font-semibold tracking-tight text-foreground select-none",
        nav: "flex items-center space-x-1",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-background/80 hover:bg-muted p-0 opacity-70 hover:opacity-100 transition-all absolute left-0 top-0.5 rounded-lg border-border/60 shadow-none z-10"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-background/80 hover:bg-muted p-0 opacity-70 hover:opacity-100 transition-all absolute right-0 top-0.5 rounded-lg border-border/60 shadow-none z-10"
        ),
        month_grid: "w-full border-collapse block space-y-1",
        weekdays: "grid grid-cols-7 w-full mb-1",
        weekday:
          "text-muted-foreground h-8 text-center font-medium text-[0.75rem] uppercase tracking-wider select-none flex items-center justify-center",
        weeks: "flex flex-col gap-1 w-full",
        week: "grid grid-cols-7 w-full",
        day: "h-9 w-full text-center text-sm p-0 relative flex items-center justify-center",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal rounded-lg flex items-center justify-center transition-all hover:bg-primary/10 hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        selected:
          "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:font-semibold [&>button]:shadow-sm [&>button]:hover:!bg-primary [&>button]:hover:!text-primary-foreground",
        today:
          "[&>button]:border [&>button]:border-primary/60 [&>button]:text-primary [&>button]:font-semibold",
        outside:
          "opacity-35 [&>button]:text-muted-foreground/50 [&>button]:hover:opacity-75",
        disabled:
          "opacity-25 pointer-events-none [&>button]:text-muted-foreground/30 [&>button]:cursor-not-allowed",
        range_start:
          "rounded-l-lg bg-primary/15 [&>button]:!bg-primary [&>button]:!text-primary-foreground",
        range_end:
          "rounded-r-lg bg-primary/15 [&>button]:!bg-primary [&>button]:!text-primary-foreground",
        range_middle:
          "bg-primary/10 !rounded-none [&>button]:!bg-transparent [&>button]:!text-primary [&>button]:hover:!bg-primary/20",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...chevronProps }) => {
          if (orientation === "left") {
            return (
              <ChevronLeft
                className={cn("h-4 w-4", chevronClass)}
                {...chevronProps}
              />
            );
          }
          return (
            <ChevronRight
              className={cn("h-4 w-4", chevronClass)}
              {...chevronProps}
            />
          );
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
export { Calendar };
