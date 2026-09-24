'use client';

import * as React from 'react';
// next-themes (legacy version) doesn't have typed named exports — use require()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextThemes = require('next-themes');
const NextThemeProvider: React.FC<any> = nextThemes.ThemeProvider;
const nextUseTheme: () => any = nextThemes.useTheme;

export interface ThemeProviderProps {
  children?: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  themes?: string[];
  storageKey?: string;
  disableTransitionOnChange?: boolean;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemeProvider {...props}>{children}</NextThemeProvider>;
}

export function useTheme() {
  return nextUseTheme();
}
