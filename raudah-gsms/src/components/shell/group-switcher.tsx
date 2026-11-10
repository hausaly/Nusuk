"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { selectGroupAction } from "@/app/(app)/actions";

export interface GroupOption { id: string; code: string; name: string; status: string }

/** Switcher shown at the top of every screen; all data is filtered by the selected group. */
export function GroupSwitcher({ groups, currentId, full }: { groups: GroupOption[]; currentId?: string; full?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!groups.length) return <div className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted"><Layers className="h-4 w-4" aria-hidden /> No groups yet</div>;
  return (
    <label className={`relative flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm ${full ? "w-full" : "max-w-[16rem] md:max-w-xs"}`}>
      <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="sr-only">Group</span>
      <select aria-label="Switch group" className="w-full min-w-0 cursor-pointer truncate bg-transparent pr-1 outline-none disabled:opacity-60" value={currentId} disabled={pending}
        onChange={(e) => start(async () => { await selectGroupAction(e.target.value); router.refresh(); })}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}{g.status === "ARCHIVED" ? " (archived)" : ""}</option>)}
      </select>
    </label>
  );
}
