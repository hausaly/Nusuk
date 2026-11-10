import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { ServiceError } from "@/services/types";

export type ActionResult<T = undefined> = ({ ok: true; message?: string } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

/** Wraps a server-action body: converts known errors into a safe `{ok:false,error}` result. */
export async function safe<T = undefined>(fn: () => Promise<{ message?: string; data?: T } | void>): Promise<ActionResult<T>> {
  try {
    const r = (await fn()) ?? {};
    return { ok: true, ...r } as ActionResult<T>;
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    if (e instanceof ServiceError || e instanceof ForbiddenError || e instanceof UnauthorizedError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
