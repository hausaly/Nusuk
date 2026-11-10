"use client";
import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { RegisterSW } from "./register-sw";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SessionProvider>{children}</SessionProvider>
      <RegisterSW />
    </ThemeProvider>
  );
}
