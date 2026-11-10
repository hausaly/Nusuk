import { cookies } from "next/headers";
import type { CurrentUser } from "@/lib/session";
import { visibleGroups } from "@/services/groups";

export const GROUP_COOKIE = "gsms_group";

/**
 * All groups visible to the user + the currently selected one:
 * cookie → else the ACTIVE group starting soonest → else any non-archived group → else the first one.
 * (Never "newest": duplicating a group for next season must not hijack everyone's default.)
 */
export async function getGroupContext(user: CurrentUser) {
  const groups = await visibleGroups(user);
  const id = cookies().get(GROUP_COOKIE)?.value;
  const byStart = [...groups].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const current = groups.find((g) => g.id === id) ?? byStart.find((g) => g.status === "ACTIVE") ?? byStart.find((g) => g.status !== "ARCHIVED") ?? groups[0] ?? null;
  return { groups, current };
}
