import Link from "next/link";
import { Bell, Search } from "lucide-react";
import type { CurrentUser } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getGroupContext } from "@/lib/group-context";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS } from "./nav";
import { SidebarNav, MobileNav } from "./nav-client";
import { UserMenu } from "./user-menu";
import { GroupSwitcher } from "./group-switcher";

export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const items = NAV_ITEMS.filter((i) => !i.cap || can(user.role, i.cap));
  const [{ groups, current }, unread] = await Promise.all([getGroupContext(user), prisma.notification.count({ where: { userId: user.id, readAt: null, channel: "IN_APP" } })]);
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
          <GroupSwitcher groups={groups.map((g) => ({ id: g.id, code: g.code, name: g.name, status: g.status }))} currentId={current?.id} />
          <form action="/search" className="ml-2 hidden flex-1 md:block md:max-w-sm" role="search">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input name="q" placeholder="Search name, passport, visa, PNR, phone…" aria-label="Global search" className="w-full bg-transparent outline-none placeholder:text-muted" />
            </label>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/search" aria-label="Search" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-2/60 md:hidden"><Search className="h-5 w-5" /></Link>
            {can(user.role, "pilgrims.read") && (
              <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-2/60 md:h-10 md:w-10">
                <Bell className="h-5 w-5" aria-hidden />
                {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            )}
            <ThemeToggle />
            <UserMenu name={user.name} role={ROLE_LABELS[user.role]} />
          </div>
        </div>
      </header>
      <div className="md:flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border bg-surface p-3 md:block">
          <SidebarNav items={items} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          {current?.status === "ARCHIVED" && <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm">This group is archived and read-only.</div>}
          {children}
        </main>
      </div>
    </div>
  );
}
