import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByEmail, getAccountById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { consumeOtp, createOtpVerificationToken, normalizePhone } from "@/lib/otp-service";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { purpose: "change" | "forgot"; email?: string; phone?: string; otp?: string };
    const phone = normalizePhone(input.phone || "");
    const session = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    const account = input.purpose === "change"
      ? session ? await getAccountById(session.userId) : null
      : input.email ? await getAccountByEmail(input.email) : null;
    if (!account) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    if (!phone || !consumeOtp(`${input.purpose}:${account.userId}`, input.otp || "", phone)) {
      return NextResponse.json({ error: "OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 400 });
    }
    return NextResponse.json({ verificationToken: createOtpVerificationToken({ userId: account.userId, phone, purpose: input.purpose }) });
  } catch (error) {
    console.error("OTP verification failed", error);
    return NextResponse.json({ error: "ไม่สามารถยืนยัน OTP ได้" }, { status: 500 });
  }
}
