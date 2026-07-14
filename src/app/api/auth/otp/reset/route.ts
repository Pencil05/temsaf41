import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountSecurityByGmail, getAccountSecurityById, updateAccountGmail, updateAccountPassword } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { consumeOtpVerificationToken, normalizeRecoveryEmail } from "@/lib/otp-service";

function validatePassword(password: string) {
  if (password.length < 8) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  return null;
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      purpose: "change" | "forgot";
      email?: string;
      gmail?: string;
      verificationToken: string;
      password: string;
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

    const passwordError = validatePassword(input.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const verification = consumeOtpVerificationToken(input.verificationToken, {
      userId: account.userId,
      purpose: input.purpose,
      passwordHash: account.passwordHash || account.legacyPassword || "",
      storedGmail: account.gmail || "",
    });

    if (!verification || verification.email !== gmail) {
      return NextResponse.json({ error: "สิทธิ์ยืนยัน OTP หมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่" }, { status: 400 });
    }

    await updateAccountGmail(account.userId, gmail);
    await updateAccountPassword(account.userId, input.password);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถเปลี่ยนรหัสผ่านได้";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
