import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

const MODEL = "gemini-3.1-flash-lite";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "ไม่มีสิทธิ์ผู้ดูแลระบบ" }, { status: 403 });
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "AI ผู้ช่วยยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" }, { status: 503 });

  try {
    const body = await request.json() as { audio?: string; mimeType?: string };
    const audio = String(body.audio || "");
    const mimeType = String(body.mimeType || "audio/webm");
    if (!audio || audio.length > 10_000_000) return NextResponse.json({ error: "ไฟล์เสียงว่างหรือมีขนาดใหญ่เกินไป" }, { status: 400 });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ถอดเสียงภาษาไทยนี้ให้ตรงตามคำพูดที่สุด ตอบเฉพาะข้อความที่พูดเท่านั้น รักษาชื่อบุคคล ชื่อกองร้อย ชื่อยุทโธปกรณ์ ตัวเลข ทะเบียนรถ และรหัสเอกสาร ห้ามเดาคำที่ไม่ได้ยิน" }, { inlineData: { mimeType, data: audio } }] }] }),
      cache: "no-store",
    });
    const result = await response.json() as GeminiResponse;
    if (response.status === 429) return NextResponse.json({ error: "API key มาถึง limit แล้ว กรุณารอ 1 นาทีถึงดำเนินการต่อได้" }, { status: 429 });
    if (!response.ok) return NextResponse.json({ error: result.error?.message || "ไม่สามารถถอดเสียงได้" }, { status: response.status });
    const transcript = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim().replace(/^['\"]|['\"]$/g, "") || "";
    if (!transcript) return NextResponse.json({ error: "ไม่พบเสียงพูดที่ชัดเจน กรุณาลองพูดใหม่" }, { status: 422 });
    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ไม่สามารถถอดเสียงได้" }, { status: 400 });
  }
}
