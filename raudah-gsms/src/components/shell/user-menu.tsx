"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function UserMenu({ name, role }: { name: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 items-center gap-2 rounded-xl px-2 hover:bg-surface-2/60 md:h-10" aria-label="Account menu">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted">{role}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-3 py-2 text-sm md:hidden"><div className="font-medium">{name}</div><div className="text-xs text-muted">{role}</div></div>
        <DropdownMenuItem asChild><Link href="/account/security"><ShieldCheck className="h-4 w-4" aria-hidden /> Security &amp; password</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}><LogOut className="h-4 w-4" aria-hidden /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
