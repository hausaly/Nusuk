import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fmtZoned, KSA_AIRPORTS, TZ_KSA } from "@/lib/tz";
import { AB, AF } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Table } from "@/components/ui/bits";
import { archiveGroupAction, createGroupAction, duplicateGroupAction, groupStatusAction, purgeFilesAction } from "../actions";

export const metadata: Metadata = { title: "Groups" };
const day = (d: Date) => fmtZoned(d, TZ_KSA, { hour: undefined, minute: undefined });

export default async function GroupsPage() {
  await requirePageUser("groups.manage");
  const [groups, agents, staff] = await Promise.all([
    prisma.group.findMany({ orderBy: { startDate: "desc" }, include: { _count: { select: { pilgrims: true, hotels: true } }, supervisor: { select: { name: true } }, agents: { include: { agent: true } } } }),
    prisma.agent.findMany({ where: { active: true }, orderBy: { groupName: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: { not: "AGENT" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Groups" sub="Every pilgrim, room, trip and report belongs to exactly one group." />
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">+ New group</summary>
        <AF action={createGroupAction} submit="Create group" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Group name" htmlFor="g-name"><Input id="g-name" name="name" required placeholder="Umrah December 2026" /></Field>
            <Field label="Start date" htmlFor="g-s"><Input id="g-s" name="startDate" type="date" required /></Field>
            <Field label="End date" htmlFor="g-e"><Input id="g-e" name="endDate" type="date" required /></Field>
            <Field label="Arrival airport (KSA)" htmlFor="g-a"><Select id="g-a" name="arrivalAirport">{KSA_AIRPORTS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
            <Field label="Departure airport (KSA)" htmlFor="g-d"><Select id="g-d" name="departureAirport" defaultValue="MED">{KSA_AIRPORTS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
            <Field label="Supervisor" htmlFor="g-sup"><Select id="g-sup" name="supervisorId"><option value="">—</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          </div>
          <fieldset className="mt-4"><legend className="mb-1.5 text-sm font-medium">Agents included</legend>
            <div className="flex flex-wrap gap-3">{agents.map((a) => <label key={a.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="agentIds" value={a.id} className="h-5 w-5" /> {a.groupName}</label>)}</div>
          </fieldset>
        </AF>
      </details>
      <Table head={["Code", "Group", "Dates", "Airports", "Pilgrims", "Status", ""]} min={900} empty={groups.length ? undefined : "No groups yet."}>
        {groups.map((g) => (
          <tr key={g.id}>
            <td className="font-mono text-xs">{g.code}</td>
            <td className="font-medium">{g.name}<div className="text-xs font-normal text-muted">{g.agents.map((a) => a.agent.groupName).join(", ") || "No agents"}{g.supervisor ? ` · Supervisor: ${g.supervisor.name}` : ""}</div></td>
            <td className="whitespace-nowrap">{day(g.startDate)} → {day(g.endDate)}</td>
            <td>{g.arrivalAirport} / {g.departureAirport}</td>
            <td>{g._count.pilgrims}</td>
            <td><Badge tone={g.status === "ACTIVE" ? "success" : g.status === "ARCHIVED" ? "neutral" : "primary"}>{g.status}</Badge></td>
            <td className="space-y-2">
              {g.status !== "ARCHIVED" && (
                <div className="flex flex-wrap gap-1">
                  {g.status === "PLANNING" && <AB action={groupStatusAction.bind(null, g.id, "ACTIVE")}>Activate</AB>}
                  {g.status === "ACTIVE" && <AB action={groupStatusAction.bind(null, g.id, "COMPLETED")}>Complete</AB>}
                  <AB action={archiveGroupAction.bind(null, g.id)} confirm="Archive this group? It becomes read-only.">Archive</AB>
                </div>
              )}
              {g.status === "ARCHIVED" && <AB action={purgeFilesAction.bind(null, g.id)} confirm="Permanently delete the stored PDF files of this archived group?">Purge files</AB>}
              <details><summary className="cursor-pointer text-xs text-primary">Duplicate setup…</summary>
                <AF action={duplicateGroupAction.bind(null, g.id)} submit="Duplicate" className="mt-2 space-y-2">
                  <Input name="name" required placeholder="New group name" aria-label="New group name" /><Input name="startDate" type="date" required aria-label="New start date" />
                  <p className="text-xs text-muted">Copies hotels, rooms, trip templates and ziyarah — no pilgrims.</p>
                </AF>
              </details>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
