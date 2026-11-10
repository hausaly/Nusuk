import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/bits";
import { PilgrimFields } from "../pilgrim-form";
import { createPilgrimAction } from "../../actions";

export const metadata: Metadata = { title: "Add pilgrim" };

export default async function NewPilgrim() {
  const user = await requirePageUser("pilgrims.write");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const agents = await prisma.agent.findMany({ where: { active: true }, orderBy: { groupName: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add pilgrim" sub={`${current.code} · ${current.name}`} />
      <div className="card p-5"><AF action={createPilgrimAction.bind(null, current.id)} submit="Add pilgrim"><PilgrimFields agents={agents} /></AF></div>
    </div>
  );
}
