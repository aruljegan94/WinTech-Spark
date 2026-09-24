import "./globals.css";
import { Roboto } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import ClientRoot from "./client-root";

const fontSans = Roboto({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "700"],
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
      </head>
      <body className={fontSans.variable}>
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
