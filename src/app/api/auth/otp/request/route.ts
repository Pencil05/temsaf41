import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountSecurityByGmail, getAccountSecurityById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { issueOtpChallenge, normalizeRecoveryEmail } from "@/lib/otp-service";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { purpose: "change" | "forgot"; email?: string; gmail?: string };
    const gmail = normalizeRecoveryEmail(input.gmail || "");

    if (!gmail || !gmail.endsWith("@gmail.com")) {
      return NextResponse.json({ error: "กรุณากรอก Gmail สำหรับรับ OTP ให้ถูกต้อง" }, { status: 400 });
    }

    const session = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    const account = input.purpose === "change"
      ? session
        ? await getAccountSecurityById(session.userId)
        : null
      : await getAccountSecurityByGmail(gmail);

    if (!account) {
      return NextResponse.json({ error: "ไม่พบ Gmail นี้ในบัญชีผู้ใช้ กรุณาตรวจสอบ Gmail ที่บันทึกไว้ในตั้งค่าโปรไฟล์" }, { status: 404 });
    }

    if (account.gmail && normalizeRecoveryEmail(account.gmail) !== gmail) {
      return NextResponse.json({ error: "Gmail สำหรับกู้คืนไม่ตรงกับข้อมูลที่บันทึกไว้" }, { status: 400 });
    }

    const otp = await issueOtpChallenge({
      userId: account.userId,
      email: gmail,
      purpose: input.purpose,
    });

    if (!otp.delivered) {
      return NextResponse.json({ error: "ระบบส่งรหัส OTP ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, { status: 503 });
    }

    return NextResponse.json({
      challengeToken: otp.challengeToken,
      maskedEmail: otp.maskedEmail,
      expiresInSeconds: otp.expiresInSeconds,
    });
  } catch (error) {
    console.error("OTP request failed", error);
    const message = error instanceof Error && error.message === "Gmail OTP provider is not configured."
      ? "ระบบส่งรหัส OTP ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ"
      : "ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่อีกครั้ง";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
