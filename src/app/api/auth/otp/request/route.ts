import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByEmail, getAccountById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { issueOtp, normalizePhone } from "@/lib/otp-service";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { purpose: "change" | "forgot"; email?: string; phone?: string };
    const phone = normalizePhone(input.phone || "");
    if (!phone) return NextResponse.json({ error: "กรุณากรอกเบอร์มือถือ 10 หลักให้ถูกต้อง" }, { status: 400 });
    const session = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    const account = input.purpose === "change"
      ? session ? await getAccountById(session.userId) : null
      : input.email ? await getAccountByEmail(input.email) : null;
    if (!account) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    if (input.purpose === "forgot" && normalizePhone(account.phone) !== phone) {
      return NextResponse.json({ error: "เบอร์โทรศัพท์ไม่ตรงกับบัญชีผู้ใช้" }, { status: 400 });
    }
    const otp = await issueOtp(`${input.purpose}:${account.userId}`, phone);
    return NextResponse.json({
      maskedPhone: `${phone.slice(0, 3)}****${phone.slice(-3)}`,
      developmentOtp: otp.delivered ? undefined : otp.code,
    });
  } catch (error) {
    console.error("OTP request failed", error);
    return NextResponse.json({ error: "ไม่สามารถส่ง OTP ได้" }, { status: 500 });
  }
}
