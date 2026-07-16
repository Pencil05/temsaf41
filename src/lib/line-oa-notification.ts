import "server-only";

export type LineActivityNotification = {
  kind: "borrow" | "return" | "defect";
  actorName: string;
  ownerCompanyName: string;
  borrowerCompanyName?: string;
  referenceId: string;
  occurredAt: string;
  dueDate?: string;
  note?: string;
  items: Array<{ name: string; quantity: number; plateNumber?: string }>;
};

type LineDeliveryResult = { sent: boolean; reason?: string };

const activityTitle = {
  borrow: "📦 แจ้งเตือนการเบิกยุทโธปกรณ์",
  return: "✅ แจ้งเตือนการคืนยุทโธปกรณ์",
  defect: "🛠️ แจ้งเตือนยุทโธปกรณ์ชำรุด",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function buildMessage(notification: LineActivityNotification) {
  const lines = [
    activityTitle[notification.kind],
    "",
    `ผู้ดำเนินการ: ${notification.actorName || "ไม่ระบุชื่อ"}`,
  ];
  if (notification.kind === "borrow") {
    lines.push(`ต้นทาง: ${notification.ownerCompanyName}`, `ปลายทาง: ${notification.borrowerCompanyName || "ไม่ระบุกองร้อย"}`);
  } else if (notification.kind === "return") {
    lines.push(`คืนจาก: ${notification.borrowerCompanyName || "ไม่ระบุกองร้อย"}`, `คืนให้: ${notification.ownerCompanyName}`);
  } else {
    lines.push(`กองร้อยเจ้าของ: ${notification.ownerCompanyName}`);
  }
  lines.push("", "รายการ:");
  notification.items.forEach((item) => lines.push(`• ${item.name}${item.plateNumber ? ` (${item.plateNumber})` : ""} จำนวน ${item.quantity.toLocaleString("th-TH")} รายการ`));
  lines.push("", `เวลา: ${formatDate(notification.occurredAt)}`);
  if (notification.dueDate) lines.push(`กำหนดคืน: ${formatDate(notification.dueDate)}`);
  if (notification.note && notification.note !== "-") lines.push(`หมายเหตุ: ${notification.note}`);
  lines.push(`เลขอ้างอิง: ${notification.referenceId}`);
  return lines.join("\n").slice(0, 4_900);
}

export async function sendLineActivityNotification(notification: LineActivityNotification): Promise<LineDeliveryResult> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const configuredMode = process.env.LINE_OA_DELIVERY_MODE?.trim().toLowerCase();
  const targetId = process.env.LINE_OA_TARGET_ID?.trim();
  const mode = configuredMode || (targetId ? "push" : "");
  if (!accessToken || !["broadcast", "push"].includes(mode)) return { sent: false, reason: "not-configured" };
  if (mode === "push" && !targetId) return { sent: false, reason: "missing-target" };

  try {
    const response = await fetch(`https://api.line.me/v2/bot/message/${mode}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...(mode === "push" ? { to: targetId } : {}), messages: [{ type: "text", text: buildMessage(notification) }], notificationDisabled: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      console.error("TEMS LINE OA delivery failed", response.status, details);
      return { sent: false, reason: `line-${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("TEMS LINE OA delivery failed", error instanceof Error ? error.message : "unknown-error");
    return { sent: false, reason: "network-error" };
  }
}
