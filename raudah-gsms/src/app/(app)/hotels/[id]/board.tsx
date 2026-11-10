"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, LogIn, LogOut, ShieldX, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Res = Promise<{ ok: boolean; error?: string; message?: string }>;
interface Guest { id: string; name: string; gender: string; checkedIn: boolean; checkedOut: boolean }
interface Room { id: string; roomNo: string; type: string; capacity: number; gender: string | null; guests: Guest[] }
interface Free { id: string; name: string; gender: string; green: boolean; blocking: string[] }

/** Rooming board: drag a pilgrim chip onto a room (or use the select on touch devices). Server rejects RED/full/gender mismatches. */
export function RoomingBoard({ hotelId, rooms, free, canPlan, canField, assign, unassign, check, checkRoom, removeRoom }: {
  hotelId: string; rooms: Room[]; free: Free[]; canPlan: boolean; canField: boolean;
  assign: (roomId: string, pilgrimId: string) => Res; unassign: (roomId: string, pilgrimId: string) => Res;
  check: (roomId: string, pilgrimId: string, mode: "in" | "out") => Res; checkRoom: (roomId: string, mode: "in" | "out") => Res; removeRoom: (roomId: string) => Res;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  void hotelId;
  const run = (f: () => Res) => start(async () => { const r = await f(); setErr(r.ok ? null : r.error ?? "Failed"); router.refresh(); });
  const drop = (roomId: string, e: React.DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/pilgrim"); if (id && canPlan) run(() => assign(roomId, id)); };
  const [filter, setFilter] = useState("");
  const shown = free.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]" aria-busy={pending}>
      {err && <div className="lg:col-span-2"><Alert tone="error">{err}</Alert></div>}
      <aside className="card max-h-[75vh] overflow-y-auto p-3 lg:sticky lg:top-20">
        <h2 className="mb-2 text-base">Without a room ({free.length})</h2>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" aria-label="Filter pilgrims" className="mb-2 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
        <ul className="space-y-1.5">
          {shown.map((p) => (
            <li key={p.id} draggable={canPlan && p.green} onDragStart={(e) => e.dataTransfer.setData("text/pilgrim", p.id)}
              className={cn("rounded-xl border border-border px-2 py-1.5 text-sm", p.green ? "cursor-grab bg-surface" : "bg-danger/5")}>
              <div className="flex items-center gap-1.5">
                {p.green ? <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <ShieldX className="h-4 w-4 shrink-0 text-danger" aria-label="Blocked" />}
                <span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-xs text-muted">{p.gender}</span>
              </div>
              {!p.green && <div className="mt-0.5 text-xs text-danger">Blocked: {p.blocking.join(", ").toLowerCase()}</div>}
              {canPlan && (
                <Select aria-label={`Assign ${p.name} to a room`} className="mt-1 h-9 text-xs md:h-9" defaultValue="" onChange={(e) => { if (e.target.value) run(() => assign(e.target.value, p.id)); }}>
                  <option value="">Assign to room…</option>{rooms.filter((r) => r.guests.length < r.capacity).map((r) => <option key={r.id} value={r.id}>{r.roomNo} ({r.guests.length}/{r.capacity}{r.gender ? ` ${r.gender}` : ""})</option>)}
                </Select>
              )}
            </li>
          ))}
          {!shown.length && <li className="text-sm text-muted">Everyone has a room.</li>}
        </ul>
      </aside>
      <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((r) => (
          <section key={r.id} onDragOver={(e) => { if (canPlan) { e.preventDefault(); setOver(r.id); } }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(r.id, e)}
            className={cn("card p-3", over === r.id && "ring-2 ring-primary", r.guests.length >= r.capacity && "bg-surface-2/40")} aria-label={`Room ${r.roomNo}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-sans text-sm font-semibold">Room {r.roomNo} <span className="font-normal text-muted">{r.type.toLowerCase()}</span></h3>
              <span className="text-xs text-muted">{r.guests.length}/{r.capacity} · {r.gender === "M" ? "male" : r.gender === "F" ? "female" : "family"}</span>
            </div>
            <ul className="min-h-10 space-y-1">
              {r.guests.map((g) => (
                <li key={g.id} className="flex items-center gap-1 rounded-lg bg-primary/5 px-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  {g.checkedIn && <span className="text-xs text-success" title="Checked in">● in</span>}{g.checkedOut && <span className="text-xs text-muted">out</span>}
                  {canField && !g.checkedIn && !g.checkedOut && <button aria-label={`Check in ${g.name}`} className="rounded p-1 hover:bg-surface-2" onClick={() => run(() => check(r.id, g.id, "in"))}><LogIn className="h-4 w-4" /></button>}
                  {canField && g.checkedIn && <button aria-label={`Check out ${g.name}`} className="rounded p-1 hover:bg-surface-2" onClick={() => run(() => check(r.id, g.id, "out"))}><LogOut className="h-4 w-4" /></button>}
                  {canPlan && !g.checkedIn && <button aria-label={`Remove ${g.name}`} className="rounded p-1 hover:bg-surface-2" onClick={() => run(() => unassign(r.id, g.id))}><X className="h-4 w-4" /></button>}
                </li>
              ))}
              {!r.guests.length && <li className="text-xs text-muted">Drop a pilgrim here</li>}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              {canField && r.guests.some((g) => !g.checkedIn && !g.checkedOut) && <Button size="sm" variant="outline" onClick={() => run(() => checkRoom(r.id, "in"))}>Check in room</Button>}
              {canField && r.guests.some((g) => g.checkedIn) && <Button size="sm" variant="outline" onClick={() => run(() => checkRoom(r.id, "out"))}>Check out room</Button>}
              {canPlan && !r.guests.length && <Button size="sm" variant="ghost" onClick={() => run(() => removeRoom(r.id))}>Delete</Button>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
