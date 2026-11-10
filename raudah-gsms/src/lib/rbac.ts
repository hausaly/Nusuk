import type { Role } from "@prisma/client";

/**
 * Capability matrix from the spec (section 5). Enforced server-side in the service layer
 * (assertCan) – never rely on hiding buttons in the UI.
 * Later phases add capabilities to this one table so there is a single source of truth.
 */
export const CAPABILITIES = [
  "groups.manage",      // create / duplicate / archive groups
  "pilgrims.write",     // import & edit pilgrims
  "visa.write",         // upload & confirm visas
  "ticket.write",       // upload & confirm tickets
  "payment.write",      // update payment check
  "documents.write",    // update documents check
  "planning.write",     // hotels, buses, transfers, ziyarah
  "field.write",        // boarding, check-in/out, handover
  "pilgrims.read",      // view pilgrims (group scope)
  "pilgrims.read.own",  // AGENT: only own pilgrims
  "reports.export",     // scope narrowed per role, see EXPORT_SCOPE
  "users.manage",       // users & roles
  "agents.manage",
  "audit.read",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ALL = new Set<Capability>(CAPABILITIES);

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  SUPER_ADMIN: ALL,
  VISA_OFFICER: new Set<Capability>(["visa.write", "pilgrims.read", "reports.export"]),
  TICKET_OFFICER: new Set<Capability>(["ticket.write", "pilgrims.read", "reports.export"]),
  FINANCE_STAFF: new Set<Capability>(["payment.write", "pilgrims.read", "reports.export"]),
  OPERATIONS_STAFF: new Set<Capability>([
    "pilgrims.write", "documents.write", "planning.write", "field.write", "pilgrims.read", "reports.export",
  ]),
  // Strictly read-only, own pilgrims only.
  AGENT: new Set<Capability>(["pilgrims.read.own", "reports.export"]),
};

/** Which reports each role may export (spec: "Export reports" row). */
export const EXPORT_SCOPE: Record<Role, "all" | "visa" | "ticket" | "payment" | "ops" | "own"> = {
  SUPER_ADMIN: "all",
  VISA_OFFICER: "visa",
  TICKET_OFFICER: "ticket",
  FINANCE_STAFF: "payment",
  OPERATIONS_STAFF: "ops",
  AGENT: "own",
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  VISA_OFFICER: "Visa Officer",
  TICKET_OFFICER: "Ticket Officer",
  FINANCE_STAFF: "Finance Staff",
  OPERATIONS_STAFF: "Operations Staff",
  AGENT: "Agent",
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function can(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(cap);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Please sign in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Throws ForbiddenError unless the actor's role has the capability. */
export function assertCan(actor: { role: Role }, cap: Capability): void {
  if (!can(actor.role, cap)) throw new ForbiddenError();
}

/** Staff = anyone who is not an AGENT. Pilgrims never receive system messages. */
export const isStaff = (role: Role) => role !== "AGENT";
