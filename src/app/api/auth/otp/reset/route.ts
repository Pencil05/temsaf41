import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByEmail, getAccountById, updateAccountPassword, updateAccountPhone } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { consumeOtpVerificationToken } from "@/lib/otp-service";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { purpose: "change" | "forgot"; email?: string; verificationToken: string; password: string };
    const session = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    const account = input.purpose === "change"
      ? session ? await getAccountById(session.userId) : null
      : input.email ? await getAccountByEmail(input.email) : null;
    if (!account) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    if (input.password.length < 8) return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
    const verification = consumeOtpVerificationToken(input.verificationToken, { userId: account.userId, purpose: input.purpose });
    if (!verification) return NextResponse.json({ error: "สิทธิ์ยืนยัน OTP หมดอายุ กรุณาขอรหัสใหม่" }, { status: 400 });
    await updateAccountPhone(account.userId, verification.phone);
    await updateAccountPassword(account.userId, input.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถเปลี่ยนรหัสผ่านได้";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
