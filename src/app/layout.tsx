import "./globals.css";
import { DM_Sans, DM_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import ClientRoot from "./client-root";

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const fontMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500"],
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>WinTech-Spark</title>
        <meta
          name="description"
          content="A simple, fast PWA billing software for a small automobile shop."
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClientRoot>{children}</ClientRoot>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
