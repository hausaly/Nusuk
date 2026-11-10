import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { fmtZoned, TZ_KSA, TZ_NG } from "@/lib/tz";
import { AB } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/bits";
import { markNotificationsReadAction } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requirePageUser("pilgrims.read");
  const rows = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { sentAt: "desc" }, take: 100 });
  const unread = rows.filter((r) => !r.readAt && r.channel === "IN_APP").length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" sub="In-app and WhatsApp messages go to staff only – pilgrims never receive system messages.">{unread > 0 && <AB action={markNotificationsReadAction}>Mark all read</AB>}</PageHeader>
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id} className={`card p-3 ${!n.readAt && n.channel === "IN_APP" ? "border-l-4 border-l-primary" : ""}`}>
            <div className="flex flex-wrap items-center gap-2"><Badge tone={n.channel === "WHATSAPP" ? "success" : "primary"}>{n.channel === "WHATSAPP" ? "WhatsApp" : "In-app"}</Badge><b className="text-sm">{n.title}</b>
              <span className="ml-auto text-xs text-muted">{fmtZoned(n.sentAt, TZ_NG)} NG · {fmtZoned(n.sentAt, TZ_KSA, { day: undefined, month: undefined, year: undefined })} KSA</span></div>
            <p className="mt-1 text-sm">{n.body}</p>
            <div className="mt-1 flex gap-3 text-xs text-muted">{n.link && <Link className="text-primary underline" href={n.link}>Open</Link>}<span>Delivery: {n.deliveryStatus.toLowerCase().replace("_", " ")}</span></div>
          </li>
        ))}
        {!rows.length && <li className="card p-6 text-center text-sm text-muted">Nothing yet.</li>}
      </ul>
    </div>
  );
}
