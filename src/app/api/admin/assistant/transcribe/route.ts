import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminData } from "@/lib/admin-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

const MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || "gemini-3.5-flash";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

function unique(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "Admin") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ผู้ดูแลระบบ" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI ผู้ช่วยยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" }, { status: 503 });
  }

  try {
    const body = await request.json() as { audio?: string; mimeType?: string };
    const audio = String(body.audio || "");
    const mimeType = String(body.mimeType || "audio/wav");
    if (!audio || audio.length > 10_000_000) {
      return NextResponse.json({ error: "ไฟล์เสียงว่างหรือมีขนาดใหญ่เกินไป" }, { status: 400 });
    }

    const data = await getAdminData();
    const vocabulary = {
      companies: unique(data.companies.map((company) => company.name), 100),
      equipments: unique(data.equipments.map((equipment) => equipment.name), 500),
      plates: unique(data.inventories.map((inventory) => inventory.plateNumber), 500),
      people: unique(data.users.map((person) => [person.rank, person.firstName, person.lastName].filter(Boolean).join(" ")), 500),
    };
    const instruction = `คุณเป็นระบบถอดเสียงคำสั่งภาษาไทยสำหรับระบบจัดการยุทโธปกรณ์ของกองทัพอากาศ
ถอดเสียงตามที่ได้ยินอย่างเคร่งครัดและตอบเฉพาะข้อความถอดเสียงเท่านั้น

พจนานุกรมคำเฉพาะที่สะกดถูกต้องจากฐานข้อมูล:
${JSON.stringify(vocabulary)}

กฎสำคัญ:
1. เมื่อเสียงใกล้เคียงชื่อในพจนานุกรม ให้ใช้ตัวสะกดจากพจนานุกรม
2. ห้ามแปลงชื่อกองร้อย ชื่อบุคคล หรือชื่อยุทโธปกรณ์เป็นตัวเลข ตัวเลขใช้ได้เมื่อผู้พูดกล่าวตัวเลขจริงเท่านั้น
3. รักษาจำนวน เลขทะเบียน รหัสเอกสาร และหน่วยนับให้ตรงเสียง
4. ห้ามแต่งคำสั่งหรือเดาข้อมูลที่ไม่ได้ยิน หากคำใดไม่ชัดให้เขียน [ฟังไม่ชัด]
5. ไม่ต้องอธิบาย ไม่ต้องใส่เครื่องหมายคำพูด และไม่ต้องตอบคำถาม`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instruction }, { inlineData: { mimeType, data: audio } }] }],
        generationConfig: { temperature: 0, topP: 0.1, maxOutputTokens: 512 },
      }),
      cache: "no-store",
    });
    const result = await response.json() as GeminiResponse;
    if (response.status === 429) {
      return NextResponse.json({ error: "API key มาถึง limit แล้ว กรุณารอ 1 นาทีแล้วลองใหม่" }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: result.error?.message || "ไม่สามารถถอดเสียงได้" }, { status: response.status });
    }

    const transcript = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim()
      .replace(/^[\"']|[\"']$/g, "") || "";
    if (!transcript) {
      return NextResponse.json({ error: "ไม่พบเสียงพูดที่ชัดเจน กรุณาลองพูดใหม่" }, { status: 422 });
    }
    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ไม่สามารถถอดเสียงได้" }, { status: 400 });
  }
}
