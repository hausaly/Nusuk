import type { Capability } from "@/lib/rbac";

export type IconKey = "dashboard" | "users" | "agents" | "audit" | "groups" | "pilgrims" | "documents" | "hotels" | "trips" | "handovers" | "reports" | "bell" | "reminders";
export interface NavItem { href: string; label: string; icon: IconKey; cap?: Capability }

/** Navigation filtered by capability. `pilgrims.read` = staff-only pages (AGENT users only have `pilgrims.read.own`). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/pilgrims", label: "Pilgrims", icon: "pilgrims" },
  { href: "/documents", label: "Tickets & visas", icon: "documents", cap: "pilgrims.read" },
  { href: "/hotels", label: "Hotels & rooms", icon: "hotels", cap: "pilgrims.read" },
  { href: "/trips", label: "Trips & buses", icon: "trips", cap: "pilgrims.read" },
  { href: "/handovers", label: "Handovers", icon: "handovers", cap: "field.write" },
  { href: "/reports", label: "Reports", icon: "reports", cap: "reports.export" },
  { href: "/notifications", label: "Notifications", icon: "bell", cap: "pilgrims.read" },
  { href: "/groups", label: "Groups", icon: "groups", cap: "groups.manage" },
  { href: "/admin/users", label: "Users", icon: "users", cap: "users.manage" },
  { href: "/admin/agents", label: "Agents", icon: "agents", cap: "agents.manage" },
  { href: "/admin/reminders", label: "Reminders", icon: "reminders", cap: "users.manage" },
  { href: "/admin/audit", label: "Audit log", icon: "audit", cap: "audit.read" },
];
