import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ensureRules } from "@/services/reminders";
import { AB, AF } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/bits";
import { runRemindersAction, updateRuleAction } from "../../actions";

export const metadata: Metadata = { title: "Reminder rules" };

export default async function RemindersPage() {
  await requirePageUser("users.manage");
  await ensureRules();
  const rules = await prisma.reminderRule.findMany({ orderBy: { key: "asc" } });
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Reminder rules" sub="Offsets are editable. KSA events use Asia/Riyadh time, Nigeria events use Africa/Lagos."><AB variant="default" size="default" action={runRemindersAction}>Run reminders now</AB></PageHeader>
      <div className="space-y-3">
        {rules.map((r) => {
          const o = r.offsets as { minutes?: number[]; hour?: number };
          return (
            <AF key={r.key} action={updateRuleAction.bind(null, r.key)} reset={false} submit="Save" className="card p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[16rem] flex-1"><div className="font-medium">{r.label}</div><div className="font-mono text-xs text-muted">{r.key}</div></div>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={r.enabled} className="h-5 w-5" /> Enabled</label>
                {o.minutes && <label className="text-sm">Hours before<Input name="minutes" defaultValue={o.minutes.map((m) => +(m / 60).toFixed(2)).join(", ")} className="mt-1 w-40" /></label>}
                {o.hour !== undefined && <label className="text-sm">From hour (0–23)<Input name="hour" type="number" min={0} max={23} defaultValue={o.hour} className="mt-1 w-28" /></label>}
              </div>
            </AF>
          );
        })}
      </div>
    </div>
  );
}
