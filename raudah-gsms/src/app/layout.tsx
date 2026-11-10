import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Raudah GSMS", template: "%s · Raudah GSMS" },
  description: "Raudah GSMS – Umrah Ground Service Management System for Raudah Travels & Tours Ltd",
  applicationName: "Raudah GSMS",
  appleWebApp: { capable: true, title: "Raudah", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#3F4096", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
