import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { linkLineAccountByCode } from "@/lib/account-service";

type LineWebhookEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
};

function verifySignature(body: string, suppliedSignature: string) {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!secret || !suppliedSignature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const supplied = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}

async function lineProfile(userId: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return "";
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return "";
  const profile = await response.json() as { displayName?: string };
  return profile.displayName || "";
}

async function reply(replyToken: string | undefined, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    cache: "no-store",
  });
}

async function processEvent(event: LineWebhookEvent) {
  const userId = event.source?.type === "user" ? event.source.userId : "";
  const groupId = event.source?.type === "group" ? event.source.groupId : "";
  if (event.type === "join" && groupId) {
    await reply(event.replyToken, `เชื่อมกลุ่มแจ้งเตือน Admin สำเร็จ\nนำค่านี้ไปใส่ใน Vercel Environment Variable\nLINE_ADMIN_TARGET_ID=${groupId}`);
    return;
  }
  if (event.type === "follow") {
    await reply(event.replyToken, "ยินดีต้อนรับสู่ TEMS\nกรุณาเข้าสู่ระบบ TEMS แล้วเปิด ตั้งค่าโปรไฟล์ > เชื่อมต่อ LINE จากนั้นส่งรหัสที่ได้รับมาที่แชตนี้");
    return;
  }
  if (event.type !== "message" || event.message?.type !== "text") return;
  if (groupId && event.message.text?.trim().toUpperCase() === "TEMS ADMIN ID") {
    await reply(event.replyToken, `LINE_ADMIN_TARGET_ID=${groupId}`);
    return;
  }
  if (!userId) return;
  const code = event.message.text?.toUpperCase().match(/TEMS-[A-F0-9]{8}/)?.[0];
  if (!code) return;
  try {
    const account = await linkLineAccountByCode(code, userId, await lineProfile(userId));
    await reply(event.replyToken, account
      ? `เชื่อมบัญชี TEMS สำเร็จแล้ว\n${[account.rank, account.firstName, account.lastName].filter(Boolean).join(" ")}\nระบบจะส่งเฉพาะแจ้งเตือนที่เกี่ยวข้องกับกองร้อยของคุณ`
      : "รหัสเชื่อมต่อไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จากหน้าตั้งค่าโปรไฟล์");
  } catch (error) {
    console.error("TEMS LINE account linking failed", error instanceof Error ? error.message : "unknown-error");
    await reply(event.replyToken, "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ กรุณาตรวจสอบว่าบัญชี LINE ไม่ได้ผูกกับผู้ใช้งานอื่นอยู่แล้ว");
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-line-signature") || "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const payload = JSON.parse(body) as { events?: LineWebhookEvent[] };
    await Promise.all((payload.events || []).map(processEvent));
  } catch (error) {
    console.error("TEMS LINE webhook failed", error instanceof Error ? error.message : "unknown-error");
  }
  return NextResponse.json({ success: true });
}
