declare module 'next-themes' {
  import * as React from 'react';

  export interface ThemeProviderProps {
    children?: React.ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    themes?: string[];
    storageKey?: string;
  }

  export function ThemeProvider(props: ThemeProviderProps): JSX.Element;
}
