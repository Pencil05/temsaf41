import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import {
  BorrowValidationError,
  submitBorrowRequest,
  type BorrowRequestInput,
} from "@/lib/borrow-service";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const user = readSessionValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!user || user.role !== "User") {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as BorrowRequestInput;
    const receipt = await withIdempotency(request.headers.get("X-TEMS-Request-ID"), () => submitBorrowRequest(user, payload));
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    if (error instanceof BorrowValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("TEMS borrow request failed", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกการเบิกได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
