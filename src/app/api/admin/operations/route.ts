import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminMutation } from "@/lib/admin-service";
import { adminOperationsMutation } from "@/lib/admin-operations-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "ไม่มีสิทธิ์ผู้ดูแลระบบ" }, { status: 403 });
  try {
    const input = await request.json() as Record<string, unknown>;
    if (input.action === "approve-maintenance") {
      return NextResponse.json(await adminMutation(user, { action: "maintenance-status", id: input.id, status: input.decision === "approved" ? "Inspecting" : "Rejected" }));
    }
    return NextResponse.json(await adminOperationsMutation(user, input));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" }, { status: 400 });
  }
}
