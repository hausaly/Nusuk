"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/session";
import { safe } from "@/lib/action";
import { createAgent, deleteAgent, updateAgent } from "@/services/agents";

const schema = z.object({
  groupName: z.string().min(1, "Agent group name is required.").max(120),
  contactName: z.string().min(1, "Contact name is required.").max(120),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  active: z.boolean().optional(),
});

export async function saveAgentAction(id: string | null, input: unknown) {
  return safe(async () => {
    const actor = await requireActor("agents.manage");
    const d = schema.parse(input);
    if (id) await updateAgent(actor, id, d); else await createAgent(actor, d);
    revalidatePath("/admin/agents");
    return { message: id ? "Agent updated." : "Agent created." };
  });
}

export async function deleteAgentAction(id: string) {
  return safe(async () => {
    const actor = await requireActor("agents.manage");
    await deleteAgent(actor, id);
    revalidatePath("/admin/agents");
    return { message: "Agent deleted." };
  });
}
