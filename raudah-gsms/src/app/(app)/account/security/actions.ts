"use server";
import { z } from "zod";
import { requireActor } from "@/lib/session";
import { safe } from "@/lib/action";
import { beginTotpEnrollment, changeOwnPassword, confirmTotpEnrollment } from "@/services/users";

export async function beginTotpAction() {
  return safe<{ qr: string; secret: string }>(async () => {
    const actor = await requireActor();
    const { qr, secret } = await beginTotpEnrollment(actor);
    return { data: { qr, secret } };
  });
}

export async function confirmTotpAction(code: string) {
  return safe(async () => {
    const actor = await requireActor();
    await confirmTotpEnrollment(actor, z.string().parse(code));
    return { message: "Two-factor authentication is now on." };
  });
}

export async function changePasswordAction(current: string, next: string) {
  return safe(async () => {
    const actor = await requireActor();
    await changeOwnPassword(actor, z.string().parse(current), z.string().parse(next));
    return { message: "Password changed." };
  });
}
