import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountSecurityByGmail, getAccountSecurityById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { createOtpVerificationToken, normalizeRecoveryEmail, verifyOtpChallenge } from "@/lib/otp-service";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      purpose: "change" | "forgot";
      email?: string;
      gmail?: string;
      otp?: string;
      challengeToken?: string;
    };

    const gmail = normalizeRecoveryEmail(input.gmail || "");
    const session = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    const account = input.purpose === "change"
      ? session
        ? await getAccountSecurityById(session.userId)
        : null
      : await getAccountSecurityByGmail(gmail);

    if (!account) {
      return NextResponse.json({ error: "ไม่พบ Gmail นี้ในบัญชีผู้ใช้" }, { status: 404 });
    }

    if (!gmail || !input.otp || !input.challengeToken) {
      return NextResponse.json({ error: "ข้อมูล OTP ไม่ครบถ้วน" }, { status: 400 });
    }

    const valid = verifyOtpChallenge({
      challengeToken: input.challengeToken,
      code: input.otp,
      expected: {
        userId: account.userId,
        email: gmail,
        purpose: input.purpose,
      },
    });

    if (!valid) {
      return NextResponse.json({ error: "OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 400 });
    }

    return NextResponse.json({
      verificationToken: createOtpVerificationToken({
        userId: account.userId,
        email: gmail,
        purpose: input.purpose,
        passwordHash: account.passwordHash || account.legacyPassword || "",
        storedGmail: account.gmail || "",
      }),
    });
  } catch (error) {
    console.error("OTP verification failed", error);
    return NextResponse.json({ error: "ไม่สามารถยืนยัน OTP ได้" }, { status: 500 });
  }
}
