import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createLineLinkCode, getAccountById, unlinkLineAccount } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

async function currentUser() {
  return readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const account = await getAccountById(user.userId);
  if (!account) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้งาน" }, { status: 404 });
  return NextResponse.json({
    linked: account.lineLinked,
    displayName: account.lineDisplayName,
    notifyEnabled: account.lineNotifyEnabled,
    linkedAt: account.lineLinkedAt,
  });
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  try {
    return NextResponse.json(await createLineLinkCode(user.userId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างรหัสเชื่อมต่อไม่สำเร็จ" }, { status: 400 });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  try {
    await unlinkLineAccount(user.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ" }, { status: 400 });
  }
}
