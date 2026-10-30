"use client";

import * as React from "react";
import { format, isValid } from "date-fns";
import { Calendar as CalendarIcon, X, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DatePickerProps {
  value?: Date | string | null;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: ((date: Date) => boolean) | boolean;
  className?: string;
  buttonVariant?: "outline" | "ghost" | "secondary";
  align?: "start" | "center" | "end";
  formatStr?: string;
  required?: boolean;
  allowClear?: boolean;
  showTodayShortcut?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  buttonVariant = "outline",
  align = "start",
  formatStr = "dd-MMM-yyyy",
  required = true,
  allowClear = false,
  showTodayShortcut = true,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Normalize parsed date
  const parsedDate = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return isValid(value) ? value : undefined;
    const d = new Date(value);
    return isValid(d) ? d : undefined;
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange?.(selectedDate);
      setOpen(false);
    } else if (!required) {
      onChange?.(undefined);
      setOpen(false);
    }
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    // Check if today is disabled
    if (typeof disabled === "function" && disabled(today)) {
      return;
    }
    onChange?.(today);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(undefined);
    setOpen(false);
  };

  const isDisabledFn = typeof disabled === "function" ? disabled : undefined;
  const isInputDisabled = typeof disabled === "boolean" ? disabled : false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant={buttonVariant}
          disabled={isInputDisabled}
          className={cn(
            "w-full justify-between text-left font-normal h-10 px-3 rounded-lg transition-all",
            "border-input hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-primary/20",
            !parsedDate && "text-muted-foreground",
            open && "ring-2 ring-primary/20 border-primary",
            className
          )}
        >
          <span className="truncate">
            {parsedDate ? (
              format(parsedDate, formatStr)
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {allowClear && parsedDate && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleClear(e as unknown as React.MouseEvent);
                  }
                }}
                className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Clear date"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <CalendarIcon className="h-4 w-4 opacity-60 text-primary" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 rounded-xl border border-border/80 shadow-2xl overflow-hidden bg-card backdrop-blur-md"
        align={align}
        sideOffset={6}
      >
        <div className="p-1">
          <Calendar
            mode="single"
            selected={parsedDate}
            onSelect={handleSelect}
            disabled={isDisabledFn}
            required={required}
            defaultMonth={parsedDate || new Date()}
            initialFocus
          />
        </div>

        {/* Quick action bar */}
        {(showTodayShortcut || (allowClear && parsedDate)) && (
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2 flex items-center justify-between gap-2 text-xs">
            {showTodayShortcut && (
              <button
                type="button"
                onClick={handleSelectToday}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                <span>Today ({format(new Date(), "dd-MMM")})</span>
              </button>
            )}
            {allowClear && parsedDate && (
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3 w-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

