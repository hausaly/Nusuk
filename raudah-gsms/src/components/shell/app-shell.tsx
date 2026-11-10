import Link from "next/link";
import type { CurrentUser } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS } from "./nav";
import { SidebarNav, MobileNav } from "./nav-client";
import { UserMenu } from "./user-menu";
import { GroupSwitcher } from "./group-switcher";

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const items = NAV_ITEMS.filter((i) => !i.cap || can(user.role, i.cap));
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="flex h-16 items-center gap-2 px-3 md:gap-4 md:px-6">
          <MobileNav items={items} />
          <Link href="/" aria-label="Raudah GSMS home" className="shrink-0">
            <Logo height={32} className="hidden md:inline-flex" priority />
            <Logo height={28} className="md:hidden" priority />
          </Link>
          <div className="mx-1 hidden h-6 w-px bg-border md:block" />
          <GroupSwitcher />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} role={ROLE_LABELS[user.role]} />
          </div>
        </div>
      </header>
      <div className="md:flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-surface p-3 md:block">
          <SidebarNav items={items} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
