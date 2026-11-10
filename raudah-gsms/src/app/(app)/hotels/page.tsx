import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Table } from "@/components/ui/bits";
import { createHotelAction } from "../actions";

export const metadata: Metadata = { title: "Hotels & rooms" };

export default async function HotelsPage() {
  const user = await requirePageUser("pilgrims.read");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const hotels = await prisma.hotel.findMany({ where: { groupId: current.id }, orderBy: { city: "asc" }, include: { rooms: { include: { assignments: true } } } });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Hotels & rooms" sub={`${current.code} · ${current.name}`} />
      <Table head={["Hotel", "City", "Rooms", "Beds", "Occupied", "Checked in", ""]} min={720} empty={hotels.length ? undefined : "No hotels yet."}>
        {hotels.map((h) => {
          const beds = h.rooms.reduce((s, r) => s + r.capacity, 0), occ = h.rooms.reduce((s, r) => s + r.assignments.length, 0), ci = h.rooms.reduce((s, r) => s + r.assignments.filter((a) => a.checkInAt && !a.checkOutAt).length, 0);
          return <tr key={h.id}><td className="font-medium">{h.name}<div className="text-xs font-normal text-muted">{h.address}</div></td><td><Badge tone="primary">{h.city}</Badge></td><td>{h.rooms.length}</td><td>{beds}</td><td>{occ} / {beds}</td><td>{ci}</td><td><Link className="text-primary underline" href={`/hotels/${h.id}`}>Open board</Link></td></tr>;
        })}
      </Table>
      {can(user.role, "planning.write") && current.status !== "ARCHIVED" && (
        <details className="card p-4"><summary className="cursor-pointer text-sm font-medium text-primary">+ Add hotel</summary>
          <AF action={createHotelAction.bind(null, current.id)} submit="Add hotel" className="mt-3"><div className="grid gap-3 md:grid-cols-2">
            <Field label="Name" htmlFor="h-n"><Input id="h-n" name="name" required /></Field>
            <Field label="City" htmlFor="h-c"><Select id="h-c" name="city"><option value="MAKKAH">Makkah</option><option value="MADINAH">Madinah</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Address" htmlFor="h-a"><Input id="h-a" name="address" /></Field><Field label="Contact phone" htmlFor="h-p"><Input id="h-p" name="contactPhone" inputMode="tel" /></Field></div></AF>
        </details>
      )}
    </div>
  );
}
