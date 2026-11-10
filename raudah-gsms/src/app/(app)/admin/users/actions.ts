"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES } from "@/lib/rbac";
import { requireActor } from "@/lib/session";
import { safe } from "@/lib/action";
import { createUser, resetPassword, resetTotp, updateUser } from "@/services/users";

const base = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  role: z.enum(ROLES as [string, ...string[]]),
  agentId: z.string().optional().nullable(),
  active: z.boolean().optional(),
});
type Role = Parameters<typeof createUser>[1]["role"];

export async function createUserAction(input: unknown) {
  return safe(async () => {
    const actor = await requireActor("users.manage");
    const d = base.extend({ password: z.string().min(1, "Password is required.") }).parse(input);
    await createUser(actor, { ...d, role: d.role as Role });
    revalidatePath("/admin/users");
    return { message: "User created." };
  });
}

export async function updateUserAction(id: string, input: unknown) {
  return safe(async () => {
    const actor = await requireActor("users.manage");
    const d = base.parse(input);
    await updateUser(actor, id, { ...d, role: d.role as Role });
    revalidatePath("/admin/users");
    return { message: "User updated." };
  });
}

export async function resetPasswordAction(id: string, password: string) {
  return safe(async () => {
    const actor = await requireActor("users.manage");
    await resetPassword(actor, id, z.string().parse(password));
    revalidatePath("/admin/users");
    return { message: "Password reset." };
  });
}

export async function resetTotpAction(id: string) {
  return safe(async () => {
    const actor = await requireActor("users.manage");
    await resetTotp(actor, id);
    revalidatePath("/admin/users");
    return { message: "Two-factor authentication removed. The user must set it up again." };
  });
}
