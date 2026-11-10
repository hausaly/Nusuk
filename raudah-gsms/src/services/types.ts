import type { Role } from "@prisma/client";

/** The authenticated actor passed into every service call. */
export interface Actor {
  id: string;
  role: Role;
  agentId?: string | null;
}

export class ServiceError extends Error {
  constructor(message: string, readonly code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" = "VALIDATION") {
    super(message);
    this.name = "ServiceError";
  }
}
