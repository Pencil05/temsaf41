import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountById, updateAccountProfile } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

function isValidGmail(value: string) {
  return !value || /^[^\s@]+@gmail\.com$/i.test(value.trim());
}

export async function GET() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const profile = await getAccountById(user.userId) || { ...user, phone: "", gmail: "", profileImage: "" };
  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });

  try {
    const input = (await request.json()) as {
      firstName: string;
      lastName: string;
      phone: string;
      gmail: string;
      profileImage?: string;
    };

    if (!input.firstName.trim() || !input.lastName.trim()) {
      return NextResponse.json({ error: "กรุณากรอกชื่อและนามสกุล" }, { status: 400 });
    }
    if (input.profileImage && input.profileImage.length > 45000) {
      return NextResponse.json({ error: "รูปโปรไฟล์มีขนาดใหญ่เกินไป" }, { status: 400 });
    }
    if (!isValidGmail(input.gmail)) {
      return NextResponse.json({ error: "กรุณากรอก Gmail ให้ถูกต้อง" }, { status: 400 });
    }

    return NextResponse.json({
      profile: await updateAccountProfile(user.userId, input),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "แก้ไขโปรไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
}

