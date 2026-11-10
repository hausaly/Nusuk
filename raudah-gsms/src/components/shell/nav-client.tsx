"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BedDouble, Building2, BusFront, FileText, Handshake, Layers, LayoutDashboard, Menu, BarChart3, ScrollText, UserRound, Users, X, AlarmClock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavItem } from "./nav";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  dashboard: LayoutDashboard, users: Users, agents: Building2, audit: ScrollText, groups: Layers, pilgrims: UserRound, documents: FileText,
  hotels: BedDouble, trips: BusFront, handovers: Handshake, reports: BarChart3, bell: Bell, reminders: AlarmClock,
};

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function NavLinks({ items, onNavigate }: { items: Pick<NavItem, "href" | "label" | "icon">[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = isActive(path, href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface-2/60")}>
            <Icon className="h-5 w-5" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export const SidebarNav = ({ items }: { items: NavItem[] }) => <NavLinks items={items} />;

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu className="h-6 w-6" aria-hidden />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface p-3 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-heading text-lg">Raudah GSMS</span>
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            </div>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
