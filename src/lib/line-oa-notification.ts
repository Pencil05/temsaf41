import "server-only";

import { getLineNotificationRecipients } from "@/lib/account-service";

export type LineActivityNotification = {
  kind: "borrow" | "return" | "defect" | "admin";
  actorName: string;
  ownerCompanyId?: string;
  ownerCompanyName: string;
  borrowerCompanyId?: string;
  borrowerCompanyName?: string;
  referenceId: string;
  occurredAt: string;
  dueDate?: string;
  note?: string;
  adminOnly?: boolean;
  items: Array<{ name: string; quantity: number; plateNumber?: string }>;
};

type LineDeliveryResult = { sent: boolean; reason?: string; recipientCount?: number };

const activityTitle = {
  borrow: "📦 แจ้งเตือนการเบิกยุทโธปกรณ์",
  return: "✅ แจ้งเตือนการคืนยุทโธปกรณ์",
  defect: "🛠️ แจ้งเตือนยุทโธปกรณ์ชำรุด",
  admin: "🛡️ กิจกรรมของผู้ดูแลระบบ",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function buildMessage(notification: LineActivityNotification) {
  const lines = [activityTitle[notification.kind], "", `ผู้ดำเนินการ: ${notification.actorName || "ไม่ระบุชื่อ"}`];
  if (notification.kind === "borrow") {
    lines.push(`ต้นทาง: ${notification.ownerCompanyName}`, `ปลายทาง: ${notification.borrowerCompanyName || "ไม่ระบุกองร้อย"}`);
  } else if (notification.kind === "return") {
    lines.push(`คืนจาก: ${notification.borrowerCompanyName || "ไม่ระบุกองร้อย"}`, `คืนให้: ${notification.ownerCompanyName}`);
  } else {
    lines.push(`กองร้อย: ${notification.ownerCompanyName}`);
  }
  if (notification.items.length) {
    lines.push("", "รายการ:");
    notification.items.forEach((item) => lines.push(`• ${item.name}${item.plateNumber ? ` (${item.plateNumber})` : ""} จำนวน ${item.quantity.toLocaleString("th-TH")} รายการ`));
  }
  lines.push("", `เวลา: ${formatDate(notification.occurredAt)}`);
  if (notification.dueDate) lines.push(`กำหนดคืน: ${formatDate(notification.dueDate)}`);
  if (notification.note && notification.note !== "-") lines.push(`หมายเหตุ: ${notification.note}`);
  lines.push(`เลขอ้างอิง: ${notification.referenceId}`);
  return lines.join("\n").slice(0, 4_900);
}

async function sendToTarget(accessToken: string, targetId: string, text: string) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: targetId, messages: [{ type: "text", text }], notificationDisabled: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`LINE push failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

async function sendToUsers(accessToken: string, userIds: string[], text: string) {
  for (let index = 0; index < userIds.length; index += 500) {
    const recipients = userIds.slice(index, index + 500);
    if (recipients.length === 1) {
      await sendToTarget(accessToken, recipients[0], text);
      continue;
    }
    const response = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: recipients, messages: [{ type: "text", text }], notificationDisabled: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`LINE multicast failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

export async function sendLineActivityNotification(notification: LineActivityNotification): Promise<LineDeliveryResult> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!accessToken) return { sent: false, reason: "not-configured" };

  try {
    const recipients = await getLineNotificationRecipients();
    const adminTargetId = process.env.LINE_ADMIN_TARGET_ID?.trim() || process.env.LINE_OA_TARGET_ID?.trim();
    const adminUserIds = adminTargetId ? [] : recipients.filter((recipient) => recipient.role === "Admin").map((recipient) => recipient.lineUserId);
    const companyIds = new Set([notification.ownerCompanyId, notification.borrowerCompanyId].filter(Boolean));
    const companyUserIds = notification.adminOnly
      ? []
      : recipients
          .filter((recipient) => recipient.role === "User" && companyIds.has(recipient.companyId))
          .map((recipient) => recipient.lineUserId);
    const text = buildMessage(notification);
    const uniqueUserIds = [...new Set([...adminUserIds, ...companyUserIds])];

    const deliveries: Promise<void>[] = [];
    if (adminTargetId) deliveries.push(sendToTarget(accessToken, adminTargetId, text));
    if (uniqueUserIds.length) deliveries.push(sendToUsers(accessToken, uniqueUserIds, text));
    if (!deliveries.length) return { sent: false, reason: "no-linked-recipients" };
    await Promise.all(deliveries);
    return { sent: true, recipientCount: uniqueUserIds.length + (adminTargetId ? 1 : 0) };
  } catch (error) {
    console.error("TEMS LINE OA delivery failed", error instanceof Error ? error.message : "unknown-error");
    return { sent: false, reason: "delivery-error" };
  }
}
