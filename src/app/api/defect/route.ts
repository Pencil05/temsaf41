import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { InventoryActionError, reportDefect } from "@/lib/inventory-action-service";

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }
  try {
    const input = (await request.json()) as {
      sourceType: "inventory" | "borrowed";
      sourceId: string;
      quantity: number;
      note?: string;
      evidenceImage?: string;
    };
    return NextResponse.json(await reportDefect(user, input));
  } catch (error) {
    if (error instanceof InventoryActionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("TEMS defect report failed", error);
    return NextResponse.json({ error: "ไม่สามารถบันทึกการแจ้งเสียได้" }, { status: 500 });
  }
}
