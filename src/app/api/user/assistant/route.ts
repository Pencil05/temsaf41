import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getBorrowPageData } from "@/lib/borrow-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getDashboardActionData } from "@/lib/inventory-action-service";

const MODEL = process.env.GEMINI_USER_ASSISTANT_MODEL?.trim() || "gemini-3.1-flash-lite";
const allowedActions = new Set(["navigate", "borrow", "return", "report-defect"]);
const allowedRoutes = new Set(["/user/dashboard", "/user/borrow", "/user/history", "/user/maintenance", "/user/settings", "/user/dashboard?action=return"]);

type AssistantResult = {
  type: "answer" | "clarification" | "proposal";
  message: string;
  summary?: string;
  payload?: Record<string, unknown>;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

function parseResult(raw: string): AssistantResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const result = JSON.parse(cleaned) as AssistantResult;
  if (!["answer", "clarification", "proposal"].includes(result.type) || !result.message) throw new Error("รูปแบบคำตอบจากผู้ช่วยไม่ถูกต้อง");
  if (result.type === "proposal" && !allowedActions.has(String(result.payload?.action || ""))) throw new Error("คำสั่งนี้อยู่นอกสิทธิ์ผู้ใช้งาน");
  return result;
}

export async function POST(request: Request) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") return NextResponse.json({ error: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ใช้งาน" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "AI ผู้ช่วยยังไม่พร้อมใช้งาน" }, { status: 503 });

  try {
    const body = await request.json() as { message?: string; history?: Array<{ role?: string; text?: string }> };
    const message = String(body.message || "").trim();
    if (!message || message.length > 1_500) return NextResponse.json({ error: "กรุณาระบุข้อความไม่เกิน 1,500 ตัวอักษร" }, { status: 400 });
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
    const [borrowData, actionData] = await Promise.all([getBorrowPageData(user), getDashboardActionData(user)]);
    const context = {
      now: new Date().toISOString(),
      user: { id: user.userId, name: actionData.userName, companyId: user.companyId, companyName: actionData.companyName },
      companies: borrowData.companies,
      availableInventory: borrowData.inventory,
      returnableTransactions: actionData.returns,
      defectableInventory: actionData.defects,
      routes: [...allowedRoutes],
    };
    const systemInstruction = `คุณคือ TEMS Copilot สำหรับผู้ใช้งานหน้างาน ตอบภาษาไทย กระชับ เป็นมิตร และใช้เฉพาะข้อมูล CONTEXT
คุณต้องรักษาสิทธิ์อย่างเคร่งครัด ผู้ใช้ทำได้เฉพาะดูข้อมูลของหน่วยตนเอง เปิดเมนู เบิกยุทโธปกรณ์จากคลังตนเอง คืนรายการที่หน่วยตนถืออยู่ และแจ้งเสียของที่หน่วยตนเป็นเจ้าของ
ห้ามเสนอเพิ่ม/ลบผู้ใช้ แก้คลัง เคลื่อนย้ายโดย Admin ลบประวัติ แก้สถานะซ่อม หรือดำเนินการแทนกองร้อยอื่น
ห้ามอ้างว่าดำเนินการสำเร็จ การเปลี่ยนข้อมูลทุกครั้งต้องตอบ type=proposal เพื่อให้ผู้ใช้ตรวจสอบและกดยืนยันอีกครั้ง
ใช้บทสนทนาก่อนหน้าเพื่อเข้าใจคำว่า “อันนั้น”, “รายการเดิม”, “ทั้งหมด” แต่ต้องตรวจสอบกับ CONTEXT ปัจจุบัน
ถ้าข้อมูลไม่พอ ชื่อซ้ำ รายการคืนมาจากเจ้าของคนละกองร้อย หรือจำนวนไม่ชัด ให้ตอบ type=clarification
คำสั่งที่รองรับ:
- navigate: {action:"navigate",href} โดย href ต้องอยู่ใน routes
- borrow: {action:"borrow",borrowerCompanyId,dueDate,note?,items:[{inventoryId,quantity,plateNumber?}]}
- return: {action:"return",items:[{transactionId,quantity}]}
- report-defect: {action:"report-defect",sourceType:"inventory",sourceId,quantity,note} และแจ้งว่าต้องแนบรูปก่อนยืนยัน
กฎเบิก: ใช้ได้เฉพาะ availableInventory, quantity ไม่เกิน available, รถ/รายการมีทะเบียนเลือกตาม plateNumber, วันคืนต้องอยู่ในอนาคต
ห้ามนำรายการที่ inboundBorrowed มากกว่า 0 ไปเบิกให้กองร้อยอื่นโดยเด็ดขาด เพราะเป็นยุทโธปกรณ์ที่รับยืมมาและส่งต่อไม่ได้
กฎคืน: ใช้ได้เฉพาะ returnableTransactions, quantity ไม่เกิน quantity ของรายการ และรายการที่คืนพร้อมกันต้องมี ownerCompanyId เดียวกัน
กฎแจ้งเสีย: ใช้ได้เฉพาะ defectableInventory ที่ sourceType=inventory, quantity ไม่เกิน maximum และต้องมีรูปหลักฐานจากผู้ใช้
ถ้าเป็นคำถามข้อมูลให้ type=answer ถ้าต้องถามเพิ่มให้ type=clarification ถ้าพร้อมดำเนินการให้ type=proposal
ตอบ JSON เท่านั้น: {"type":"answer|clarification|proposal","message":"ข้อความ","summary":"สรุปรายการ จำนวน ต้นทาง ปลายทาง และผลกระทบ","payload":{}}
CONTEXT=${JSON.stringify(context)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: [...history, { role: "user", parts: [{ text: message }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.15 } }),
      cache: "no-store",
    });
    const result = await response.json() as GeminiResponse;
    if (response.status === 429) return NextResponse.json({ error: "AI ใช้งานครบโควตาชั่วคราว กรุณารอ 1 นาทีแล้วลองใหม่" }, { status: 429 });
    if (!response.ok) return NextResponse.json({ error: result.error?.message || "AI ผู้ช่วยไม่สามารถตอบได้ในขณะนี้" }, { status: response.status });
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const assistant = parseResult(text);
    if (assistant.type !== "proposal") return NextResponse.json(assistant);

    const payload = assistant.payload || {};
    const action = String(payload.action || "");
    if (action === "navigate" && !allowedRoutes.has(String(payload.href || ""))) throw new Error("ปลายทางนี้อยู่นอกเมนูผู้ใช้งาน");
    if (action === "borrow") {
      if (!borrowData.companies.some((company) => company.id === payload.borrowerCompanyId)) throw new Error("ไม่พบกองร้อยปลายทาง");
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw new Error("ยังไม่ได้เลือกยุทโธปกรณ์ที่จะเบิก");
      for (const rawItem of items) {
        const item = rawItem as Record<string, unknown>;
        const inventory = borrowData.inventory.find((candidate) => candidate.inventoryId === item.inventoryId && (!candidate.requirePlate || candidate.plateNumber === String(item.plateNumber || "")));
        const quantity = Math.floor(Number(item.quantity));
        if (!inventory || quantity < 1 || quantity > inventory.available || (inventory.requirePlate && quantity !== 1)) throw new Error("รายการหรือจำนวนที่ AI เตรียมไว้ไม่ตรงกับยอดพร้อมเบิกล่าสุด");
        if (payload.borrowerCompanyId !== user.companyId && inventory.inboundBorrowed > 0) throw new Error("AI ไม่สามารถนำยุทโธปกรณ์ที่รับยืมมาไปให้กองร้อยอื่นยืมต่อได้");
      }
    }
    if (action === "return") {
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw new Error("ยังไม่ได้เลือกรายการที่จะคืน");
      const owners = new Set<string>();
      for (const rawItem of items) {
        const item = rawItem as Record<string, unknown>;
        const transaction = actionData.returns.find((candidate) => candidate.transactionId === item.transactionId);
        const quantity = Math.floor(Number(item.quantity));
        if (!transaction || quantity < 1 || quantity > transaction.quantity) throw new Error("รายการหรือจำนวนคืนไม่ตรงกับยอดค้างล่าสุด");
        owners.add(transaction.ownerCompanyId);
      }
      if (owners.size !== 1) throw new Error("รายการคืนพร้อมกันต้องมาจากกองร้อยเจ้าของเดียวกัน");
    }
    if (action === "report-defect") {
      const defect = actionData.defects.find((candidate) => candidate.sourceType === "inventory" && candidate.sourceId === payload.sourceId);
      const quantity = Math.floor(Number(payload.quantity));
      if (!defect || quantity < 1 || quantity > defect.maximum) throw new Error("รายการหรือจำนวนแจ้งเสียไม่ตรงกับยอดล่าสุด");
    }
    return NextResponse.json(assistant);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI ผู้ช่วยไม่สามารถประมวลผลคำสั่งได้" }, { status: 400 });
  }
}
