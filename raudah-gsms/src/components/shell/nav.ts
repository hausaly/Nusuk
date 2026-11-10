import type { Capability } from "@/lib/rbac";

export type IconKey = "dashboard" | "users" | "agents" | "audit";
export interface NavItem { href: string; label: string; icon: IconKey; cap?: Capability }

/** Navigation filtered by capability. Later phases append items (Pilgrims, Tickets, Hotels, Trips…). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/users", label: "Users", icon: "users", cap: "users.manage" },
  { href: "/admin/agents", label: "Agents", icon: "agents", cap: "agents.manage" },
  { href: "/admin/audit", label: "Audit log", icon: "audit", cap: "audit.read" },
];
