import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminMutation } from "@/lib/admin-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "ไม่มีสิทธิ์ผู้ดูแลระบบ" }, { status: 403 });
  try { return NextResponse.json(await adminMutation(user, await request.json())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, { status: 400 }); }
}
