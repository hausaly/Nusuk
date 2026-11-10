import { cookies } from "next/headers";
import type { CurrentUser } from "@/lib/session";
import { visibleGroups } from "@/services/groups";

export const GROUP_COOKIE = "gsms_group";

/** All groups visible to the user + the currently selected one (cookie → else newest non-archived → else first). */
export async function getGroupContext(user: CurrentUser) {
  const groups = await visibleGroups(user);
  const id = cookies().get(GROUP_COOKIE)?.value;
  const current = groups.find((g) => g.id === id) ?? groups.find((g) => g.status !== "ARCHIVED") ?? groups[0] ?? null;
  return { groups, current };
}
