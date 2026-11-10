import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { hotelBoard } from "@/services/hotels";
import { AB, AF } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/bits";
import { addRoomsAction, assignRoomAction, autoFillAction, checkAction, checkRoomAction, deleteRoomAction, unassignRoomAction } from "../../actions";
import { RoomingBoard } from "./board";

export const metadata: Metadata = { title: "Rooming" };

export default async function HotelPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser("pilgrims.read");
  let b; try { b = await hotelBoard(params.id); } catch { notFound(); }
  const { hotel, free } = b;
  const plan = can(user.role, "planning.write") && hotel.group.status !== "ARCHIVED", field = can(user.role, "field.write") && hotel.group.status !== "ARCHIVED";
  const beds = hotel.rooms.reduce((s, r) => s + r.capacity, 0), occ = hotel.rooms.reduce((s, r) => s + r.assignments.length, 0);
  const rooms = hotel.rooms.map((r) => ({ id: r.id, roomNo: r.roomNo, type: r.type, capacity: r.capacity, gender: r.gender, guests: r.assignments.map((a) => ({ id: a.pilgrimId, name: a.pilgrim.fullName, gender: a.pilgrim.gender, checkedIn: !!a.checkInAt && !a.checkOutAt, checkedOut: !!a.checkOutAt })) }));
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={hotel.name} sub={`${hotel.city} · ${occ} / ${beds} beds occupied · ${free.length} pilgrim(s) without a room`}>
        {plan && <AB variant="default" size="default" action={autoFillAction.bind(null, hotel.id)} confirm="Auto-fill rooms for all unassigned GREEN pilgrims?">Auto-fill rooms</AB>}
        <Link href="/hotels" className="text-sm text-primary underline">All hotels</Link>
        <a href={`/api/reports/rooming_list?id=${hotel.id}`} target="_blank" className="text-sm text-primary underline">Rooming list PDF</a>
        <a href={`/api/reports/rooming_list?id=${hotel.id}&format=xlsx`} className="text-sm text-primary underline">Excel</a>
      </PageHeader>
      {plan && (
        <details className="card p-4"><summary className="cursor-pointer text-sm font-medium text-primary">+ Add rooms</summary>
          <AF action={addRoomsAction.bind(null, hotel.id)} submit="Add rooms" className="mt-3"><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="From no." htmlFor="r-f"><Input id="r-f" name="from" type="number" required /></Field><Field label="To no." htmlFor="r-t"><Input id="r-t" name="to" type="number" required /></Field>
            <Field label="Prefix" htmlFor="r-p"><Input id="r-p" name="prefix" placeholder="e.g. A" /></Field>
            <Field label="Type" htmlFor="r-ty"><Select id="r-ty" name="type"><option>DOUBLE</option><option>TRIPLE</option><option>QUAD</option><option>OTHER</option></Select></Field>
            <Field label="Gender" htmlFor="r-g"><Select id="r-g" name="gender"><option value="">Family / mixed</option><option value="M">Male only</option><option value="F">Female only</option></Select></Field></div></AF>
        </details>
      )}
      <RoomingBoard hotelId={hotel.id} rooms={rooms} free={free.map((p) => ({ id: p.id, name: p.fullName, gender: p.gender, green: p.clearance.green, blocking: p.clearance.blocking }))}
        canPlan={plan} canField={field}
        assign={assignRoomAction.bind(null, hotel.id)} unassign={unassignRoomAction.bind(null, hotel.id)} check={checkAction.bind(null, hotel.id)} checkRoom={checkRoomAction.bind(null, hotel.id)} removeRoom={deleteRoomAction.bind(null, hotel.id)} />
      {!rooms.length && <Badge tone="neutral">No rooms yet – add a range above.</Badge>}
    </div>
  );
}
