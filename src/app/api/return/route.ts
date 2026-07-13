import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { InventoryActionError, returnEquipment } from "@/lib/inventory-action-service";

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }
  try {
    const input = (await request.json()) as { transactionId: string; destinationCompanyId: string };
    return NextResponse.json(await returnEquipment(user, input));
  } catch (error) {
    if (error instanceof InventoryActionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("TEMS return failed", error);
    return NextResponse.json({ error: "ไม่สามารถคืนยุทโธปกรณ์ได้" }, { status: 500 });
  }
}
