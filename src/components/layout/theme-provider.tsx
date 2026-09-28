'use client';

import * as React from 'react';
import { ThemeProvider as NextThemeProvider, useTheme as nextUseTheme } from 'next-themes';

export interface ThemeProviderProps {
  children?: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  themes?: string[];
  storageKey?: string;
  disableTransitionOnChange?: boolean;
  forcedTheme?: string;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemeProvider {...(props as any)}>{children}</NextThemeProvider>;
}

export function useTheme() {
  return nextUseTheme();
}

