import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminData } from "@/lib/admin-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

const MODEL = "gemini-3.1-flash-lite";
const allowedActions = new Set([
  "save-company", "delete-company", "save-user", "delete-user", "save-equipment", "delete-equipment", "delete-equipment-category",
  "add-inventory", "save-inventory", "transfer-inventory", "delete-inventory",
  "return-transaction", "report-defect", "maintenance-status", "dispose-maintenance",
]);

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; status?: string };
};

type AssistantResult = {
  type: "answer" | "clarification" | "proposal";
  message: string;
  summary?: string;
  payload?: Record<string, unknown>;
};

function parseResult(raw: string): AssistantResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as AssistantResult;
  if (!["answer", "clarification", "proposal"].includes(parsed.type) || !parsed.message) throw new Error("รูปแบบคำตอบจาก AI ไม่ถูกต้อง");
  if (parsed.type === "proposal") {
    const action = String(parsed.payload?.action || "");
    if (!allowedActions.has(action)) throw new Error("AI เสนอคำสั่งที่ระบบไม่อนุญาต");
  }
  return parsed;
}

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "ไม่มีสิทธิ์ผู้ดูแลระบบ" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "AI ผู้ช่วยยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์" }, { status: 503 });

  try {
    const body = await request.json() as { message?: string; history?: Array<{ role?: string; text?: string }> };
    const message = String(body.message || "").trim();
    if (!message || message.length > 1_500) return NextResponse.json({ error: "กรุณาพิมพ์คำสั่งไม่เกิน 1,500 ตัวอักษร" }, { status: 400 });
    const rawHistory = (Array.isArray(body.history) ? body.history : []).slice(-12).map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.text || "").slice(0, 2_000) }],
    })).filter((item) => item.parts[0].text.trim());
    const history = rawHistory.reduce<typeof rawHistory>((items, item) => {
      const previous = items.at(-1);
      if (previous?.role === item.role) previous.parts[0].text += `\n${item.parts[0].text}`;
      else items.push(item);
      return items;
    }, []);
    const data = await getAdminData();
    const context = {
      companies: data.companies.map(({ id, name }) => ({ id, name })),
      users: data.users.map(({ id, companyId, rank, firstName, lastName, email, role }) => ({ id, companyId, name: `${rank} ${firstName} ${lastName}`.trim(), email, role })),
      equipments: data.equipments.map(({ id, name, category, requirePlate }) => ({ id, name, category, requirePlate })),
      inventories: data.inventories.map(({ id, companyId, equipmentId, equipmentName, plateNumber, total, available, borrowed, broken }) => ({ id, companyId, equipmentId, equipmentName, plateNumber, total, available, borrowed, broken })),
      maintenance: data.maintenance.map(({ id, inventoryId, companyId, equipmentName, plateNumber, quantity, status }) => ({ id, inventoryId, companyId, equipmentName, plateNumber, quantity, status })),
      activeBorrows: data.transactions.filter((item) => item.movementType === "borrow" && ["borrowed", "overdue"].includes(item.status.toLowerCase())).map(({ id, equipmentName, plateNumber, ownerCompanyId, borrowerCompanyId, outstandingQuantity, status }) => ({ id, equipmentName, plateNumber, ownerCompanyId, borrowerCompanyId, outstandingQuantity, status })),
    };
    const systemInstruction = `คุณคือ AI ผู้ช่วยผู้ดูแลระบบ TEMS ตอบภาษาไทย กระชับ และต้องแม่นยำจากข้อมูล CONTEXT เท่านั้น
ห้ามอ้างว่าดำเนินการแล้ว เพราะระบบจะดำเนินการหลังผู้ดูแลกดยืนยันอีกครั้ง
ใช้บทสนทนาก่อนหน้าเพื่อทำความเข้าใจคำอ้างอิง เช่น “อันนั้น”, “รายการเดิม”, “เพิ่มอีก” แต่ต้องตรวจสอบกับ CONTEXT ปัจจุบันเสมอ
ถ้าเป็นคำถาม ให้ตอบ type=answer ถ้าข้อมูลไม่พอให้ type=clarification ถ้าเป็นคำสั่งแก้ข้อมูลให้ type=proposal พร้อม payload ที่ใช้ได้จริง
คำสั่งที่รองรับ:
- save-company: {action,name}
- delete-company: {action,id,confirmName} (ห้ามใส่รหัสผ่าน)
- save-user: {action,id?,companyId,role,rank,firstName,lastName,email,phone?,gmail?,password?}
- delete-user: {action,id}
- save-equipment: {action,id?,name,category,requirePlate}
- delete-equipment: {action,id}
- delete-equipment-category: {action,category}
- add-inventory: {action,companyId,equipmentId,plateNumber?,total}
- save-inventory: {action,id,companyId,equipmentId,plateNumber?,total}
- transfer-inventory: {action,sourceInventoryId,destinationCompanyId,quantity}
- delete-inventory: {action,id}
- return-transaction: {action,id}
- report-defect: {action,inventoryId,quantity,note} (ต้องแจ้งว่าผู้ดูแลต้องแนบรูปก่อนยืนยัน)
- maintenance-status: {action,id,status} โดย status ใช้ Reported, Inspecting, Repairing, Completed
- dispose-maintenance: {action,id}
การลบ จำหน่าย คืน เคลื่อนย้าย และแก้ยอดเป็นคำสั่งสำคัญ ต้องเขียน summary ให้ชัดเจน ห้ามเดารหัส ถ้าชื่อซ้ำหรือไม่แน่ใจให้ clarification
ตอบ JSON เท่านั้น: {"type":"answer|clarification|proposal","message":"ข้อความ","summary":"สรุปผลกระทบ","payload":{}}
CONTEXT=${JSON.stringify(context)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: [...history, { role: "user", parts: [{ text: message }] }], generationConfig: { responseMimeType: "application/json" } }),
      cache: "no-store",
    });
    const result = await response.json() as GeminiResponse;
    if (response.status === 429) return NextResponse.json({ error: "API key มาถึง limit แล้ว กรุณารอ 1 นาทีถึงดำเนินการต่อได้" }, { status: 429 });
    if (!response.ok) return NextResponse.json({ error: result.error?.message || "Gemini ไม่สามารถตอบคำถามได้ในขณะนี้" }, { status: response.status });
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    return NextResponse.json(parseResult(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI ไม่สามารถประมวลผลคำสั่งได้" }, { status: 400 });
  }
}
