import { Layers } from "lucide-react";

/**
 * Placeholder for the group switcher that sits at the top of every screen.
 * Groups arrive in Phase 2; until then there is nothing to switch between.
 */
export function GroupSwitcher() {
  return (
    <div className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted" title="Groups arrive in Phase 2">
      <Layers className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">No group selected</span>
    </div>
  );
}
