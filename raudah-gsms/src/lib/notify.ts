import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface NotificationPayload { title: string; body: string; link?: string }

/** Pluggable WhatsApp sender. Production: Meta WhatsApp Cloud API template messages ("raudah_*" templates). */
export interface WhatsAppProvider {
  send(toPhone: string, template: string, params: string[]): Promise<{ status: string }>;
}

export class MetaCloudProvider implements WhatsAppProvider {
  async send(to: string, template: string, params: string[]) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template",
        template: { name: template, language: { code: "en" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
      }),
    });
    return { status: r.ok ? "SENT" : `FAILED_${r.status}` };
  }
}

export class MockProvider implements WhatsAppProvider {
  static sent: { to: string; template: string; params: string[] }[] = [];
  async send(to: string, template: string, params: string[]) {
    MockProvider.sent.push({ to, template, params });
    return { status: "MOCK_SENT" };
  }
}

let provider: WhatsAppProvider | null = null;
export const setWhatsAppProvider = (p: WhatsAppProvider | null) => { provider = p; };
const getProvider = (): WhatsAppProvider =>
  provider ?? (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? new MetaCloudProvider() : new MockProvider());

export const WHATSAPP_TEMPLATE = "raudah_staff_alert"; // approved template: "Raudah GSMS: {{1}} – {{2}}"

/**
 * Notifies STAFF only (business rule 9: pilgrims never receive system messages). AGENT users are excluded too:
 * they are read-only viewers. Creates an in-app notification and, when the user has a phone, a WhatsApp message.
 */
export async function notifyUsers(userIds: string[], p: NotificationPayload): Promise<number> {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(userIds)] }, active: true, role: { not: "AGENT" } } });
  for (const u of users) {
    await prisma.notification.create({ data: { userId: u.id, channel: "IN_APP", title: p.title, body: p.body, link: p.link, deliveryStatus: "DELIVERED" } });
    if (u.phone) {
      let status = "FAILED";
      try { status = (await getProvider().send(u.phone, WHATSAPP_TEMPLATE, [p.title, p.body])).status; } catch { /* logged via status */ }
      await prisma.notification.create({ data: { userId: u.id, channel: "WHATSAPP", title: p.title, body: p.body, link: p.link, deliveryStatus: status } });
    }
  }
  return users.length;
}

export async function notifyRoles(roles: Role[], p: NotificationPayload): Promise<number> {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, active: true }, select: { id: true } });
  return notifyUsers(users.map((u) => u.id), p);
}
