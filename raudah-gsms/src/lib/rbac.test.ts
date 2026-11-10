import { describe, expect, it } from "vitest";
import { assertCan, can, CAPABILITIES, ForbiddenError, ROLES, ROLE_CAPABILITIES } from "./rbac";

describe("RBAC matrix (spec section 5)", () => {
  it("SUPER_ADMIN has every capability", () => {
    for (const c of CAPABILITIES) expect(can("SUPER_ADMIN", c)).toBe(true);
  });
  it.each([
    ["VISA_OFFICER", "visa.write", true], ["VISA_OFFICER", "ticket.write", false], ["VISA_OFFICER", "pilgrims.write", false],
    ["TICKET_OFFICER", "ticket.write", true], ["TICKET_OFFICER", "visa.write", false],
    ["FINANCE_STAFF", "payment.write", true], ["FINANCE_STAFF", "documents.write", false],
    ["OPERATIONS_STAFF", "pilgrims.write", true], ["OPERATIONS_STAFF", "planning.write", true], ["OPERATIONS_STAFF", "field.write", true],
    ["OPERATIONS_STAFF", "payment.write", false], ["OPERATIONS_STAFF", "groups.manage", false], ["OPERATIONS_STAFF", "users.manage", false],
  ] as const)("%s %s => %s", (role, cap, expected) => expect(can(role, cap)).toBe(expected));

  it("only SUPER_ADMIN manages groups, users, agents and reads the audit log", () => {
    for (const cap of ["groups.manage", "users.manage", "agents.manage", "audit.read"] as const)
      for (const r of ROLES) expect(can(r, cap)).toBe(r === "SUPER_ADMIN");
  });
  it("AGENT is read-only: no write capability at all, only own-pilgrim reads", () => {
    const caps = [...ROLE_CAPABILITIES.AGENT];
    expect(caps.sort()).toEqual(["pilgrims.read.own", "reports.export"].sort());
    expect(caps.some((c) => c.endsWith(".write") || c.endsWith(".manage"))).toBe(false);
    expect(can("AGENT", "pilgrims.read")).toBe(false);
  });
  it("assertCan throws ForbiddenError (403)", () => {
    expect(() => assertCan({ role: "AGENT" }, "pilgrims.write")).toThrow(ForbiddenError);
    try { assertCan({ role: "AGENT" }, "users.manage"); } catch (e) { expect((e as ForbiddenError).status).toBe(403); }
  });
});
