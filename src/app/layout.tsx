import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import PayPalProvider from "@/components/PayPalProvider";
import ThemeProvider from "@/components/ThemeProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShipIN",
  description: "International Shopping Forwarding Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <PayPalProvider>
            {children}
          </PayPalProvider>
        </ThemeProvider>

        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          visibleToasts={4}
          toastOptions={{
            duration: 4000,
            className: "rounded-2xl",
          }}
        />
      </body>
    </html>
  );
}