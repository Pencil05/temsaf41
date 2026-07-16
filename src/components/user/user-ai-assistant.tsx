"use client";

import { AlertTriangle, Bot, CheckCircle2, ImagePlus, LoaderCircle, Mic, Navigation, Send, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { compressImageForSheet } from "@/lib/client-media";

type AssistantResult = {
  type: "answer" | "clarification" | "proposal";
  message: string;
  summary?: string;
  payload?: Record<string, unknown>;
};

type ChatMessage = { role: "assistant" | "user"; text: string; context?: string };
type SpeechResult = { isFinal: boolean; 0: { transcript: string; confidence: number } };
type SpeechEvent = Event & { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = Event & { error: string };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const quickPrompts = ["ในคลังมีอะไรพร้อมเบิกบ้าง", "มีรายการไหนต้องคืน", "เปิดหน้าประวัติ", "ช่วยเตรียมแจ้งเสีย"];
const executableActions = new Set(["navigate", "borrow", "return", "report-defect"]);

export function UserAiAssistant() {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const discardRecognitionRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "สวัสดีครับ ผมคือ TEMS Copilot ช่วยค้นข้อมูลคลัง เตรียมรายการเบิก คืน แจ้งเสีย และพาไปยังเมนูต่าง ๆ ได้ครับ" }]);
  const [pending, setPending] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [evidenceImage, setEvidenceImage] = useState("");
  const [evidenceName, setEvidenceName] = useState("");

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, pending, loading]);
  useEffect(() => () => recognitionRef.current?.abort(), []);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || loading) return;
    setInput("");
    setPending(null);
    setEvidenceImage("");
    setEvidenceName("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setLoading(true);
    try {
      const recentMessages = messages.slice(-12);
      const firstUserIndex = recentMessages.findIndex((item) => item.role === "user");
      const history = (firstUserIndex >= 0 ? recentMessages.slice(firstUserIndex) : []).map((item) => ({ role: item.role, text: item.context || item.text }));
      const response = await fetch("/api/user/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }) });
      const result = await response.json() as AssistantResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI ผู้ช่วยไม่สามารถตอบได้");
      const context = result.type === "proposal" ? `${result.message}\nข้อเสนอ=${JSON.stringify(result.payload || {})}` : result.message;
      setMessages((current) => [...current, { role: "assistant", text: result.message, context }]);
      setPending(result.type === "proposal" ? result : null);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "AI ผู้ช่วยไม่สามารถตอบได้" }]);
    } finally {
      setLoading(false);
    }
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function closeAssistant() {
    discardRecognitionRef.current = true;
    recognitionRef.current?.abort();
    setOpen(false);
  }

  function toggleMicrophone() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMessages((current) => [...current, { role: "assistant", text: "เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียง กรุณาใช้ Chrome หรือ Edge รุ่นล่าสุด" }]);
      return;
    }
    try {
      const recognition = new Recognition();
      let finalTranscript = "";
      let recognitionError = "";
      recognition.lang = "th-TH";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.onresult = (event) => {
        let interimTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }
        setInput((finalTranscript || interimTranscript).trim());
      };
      recognition.onerror = (event) => { recognitionError = event.error; };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        if (discardRecognitionRef.current) { discardRecognitionRef.current = false; return; }
        const transcript = finalTranscript.trim();
        if (transcript) { setInput(transcript); void sendMessage(transcript); return; }
        if (recognitionError && recognitionError !== "aborted") {
          setMessages((current) => [...current, { role: "assistant", text: recognitionError === "not-allowed" ? "กรุณาอนุญาตการใช้ไมโครโฟนก่อน" : "ไม่ได้ยินเสียงพูดชัดเจน กรุณาลองใหม่" }]);
        }
      };
      recognitionRef.current = recognition;
      discardRecognitionRef.current = false;
      setInput("");
      setListening(true);
      recognition.start();
    } catch (error) {
      setListening(false);
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "ไม่สามารถเปิดไมโครโฟนได้" }]);
    }
  }

  async function attachEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessages((current) => [...current, { role: "assistant", text: "กรุณาเลือกรูปขนาดไม่เกิน 5 MB" }]);
      return;
    }
    setLoading(true);
    try {
      setEvidenceImage(await compressImageForSheet(file));
      setEvidenceName(file.name);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "เตรียมรูปไม่สำเร็จ" }]);
    } finally {
      setLoading(false);
    }
  }

  async function execute() {
    const payload = pending?.payload;
    const action = String(payload?.action || "");
    if (!payload || !executableActions.has(action) || loading) return;
    if (action === "report-defect" && !evidenceImage) return;
    if (action === "navigate") {
      const href = String(payload.href || "");
      if (!href.startsWith("/user/")) return;
      setPending(null);
      setOpen(false);
      router.push(href);
      return;
    }
    const endpoint = action === "borrow" ? "/api/borrow" : action === "return" ? "/api/return" : "/api/defect";
    const { action: ignoredAction, ...requestPayload } = payload;
    void ignoredAction;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...requestPayload, ...(evidenceImage ? { evidenceImage, evidenceName } : {}) }) });
      const result = await response.json() as { error?: string; receipt?: { txId?: string }; returnGroupId?: string };
      if (!response.ok) throw new Error(result.error || "ดำเนินการไม่สำเร็จ");
      const reference = result.receipt?.txId || result.returnGroupId;
      setMessages((current) => [...current, { role: "assistant", text: `ดำเนินการสำเร็จและบันทึก Audit Log แล้ว${reference ? ` เลขที่ ${reference}` : ""}` }]);
      setPending(null);
      setEvidenceImage("");
      setEvidenceName("");
      router.refresh();
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" }]);
    } finally {
      setLoading(false);
    }
  }

  return <>
    {!open && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-4 z-[80] grid size-15 place-items-center rounded-[22px] bg-gradient-to-br from-[#103b68] via-blue-600 to-cyan-500 text-white shadow-[0_16px_42px_rgba(14,116,184,0.38)] transition hover:-translate-y-1 hover:scale-105 active:scale-95 sm:bottom-7 sm:right-7" aria-label="เปิด TEMS Copilot"><span className="absolute right-0 top-0 size-3 rounded-full border-2 border-white bg-emerald-400"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400" /></span><Sparkles className="size-7" /></button>}
    {open && <div className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssistant(); }}><section className="popup-panel absolute inset-x-3 bottom-3 top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col overflow-hidden rounded-[28px] border border-blue-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.3)] sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[420px]" aria-label="TEMS Copilot">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#0d3158] via-[#155f9d] to-[#0ea5c6] px-4 py-4 text-white"><div className="absolute -right-10 -top-14 size-36 rounded-full border-[20px] border-white/10" /><div className="relative flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Bot className="size-6 text-cyan-100" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-bold">TEMS Copilot</h2><span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-100">USER SAFE</span></div><p className="text-xs text-blue-100">ผู้ช่วยคลังประจำกองร้อย · ตรวจสิทธิ์ทุกคำสั่ง</p></div>{loading && <LoaderCircle className="size-5 animate-spin text-cyan-100" />}<button type="button" onClick={closeAssistant} className="grid size-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="ปิด"><X className="size-5" /></button></div></header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top,#eff8ff_0,#f8fafc_42%,#f8fafc_100%)] p-4">
        {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-700"}`}>{message.text}</div></div>)}
        {messages.length === 1 && <div className="grid grid-cols-2 gap-2">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} className="rounded-xl border border-blue-100 bg-white p-2.5 text-left text-xs font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98]">{prompt}</button>)}</div>}
        {loading && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-blue-100 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm"><span className="flex gap-1"><i className="size-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-.2s]" /><i className="size-1.5 animate-bounce rounded-full bg-cyan-500 [animation-delay:-.1s]" /><i className="size-1.5 animate-bounce rounded-full bg-indigo-500" /></span>กำลังตรวจข้อมูลล่าสุด...</div></div>}
        {pending && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"><div className="flex gap-2 text-amber-900"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">ตรวจสอบก่อนยืนยัน</p><p className="mt-1 text-sm leading-6">{pending.summary || pending.message}</p></div></div>{pending.payload?.action !== "navigate" && <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-white p-3"><span className="grid size-11 place-items-center overflow-hidden rounded-lg bg-amber-50">{evidenceImage ? <Image src={evidenceImage} alt="หลักฐาน" width={44} height={44} unoptimized className="size-full object-cover" /> : <ImagePlus className="size-5 text-amber-600" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{evidenceName || (pending.payload?.action === "report-defect" ? "แนบรูปหลักฐาน (จำเป็น)" : "แนบรูปหลักฐาน (ไม่บังคับ)")}</span><span className="mt-0.5 block text-[10px] text-slate-500">รองรับภาพไม่เกิน 5 MB</span></span><input type="file" accept="image/*" onChange={attachEvidence} className="sr-only" /></label>}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setPending(null); setEvidenceImage(""); setEvidenceName(""); }} className="h-11 rounded-xl bg-white font-bold text-slate-600">ยกเลิก</button><button type="button" onClick={execute} disabled={loading || (pending.payload?.action === "report-defect" && !evidenceImage)} className="h-11 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40">{pending.payload?.action === "navigate" ? <><Navigation className="mr-1 inline size-4" />เปิดเมนู</> : "ยืนยันดำเนินการ"}</button></div></div>}
      </div>
      <form onSubmit={ask} className="border-t border-slate-200 bg-white p-3"><div className="flex items-end gap-2"><button type="button" onPointerDown={(event) => { if (["mouse", "touch", "pen"].includes(event.pointerType)) { event.preventDefault(); toggleMicrophone(); } }} onClick={(event) => { if (event.detail === 0) toggleMicrophone(); }} className={`grid size-11 shrink-0 place-items-center rounded-xl transition ${listening ? "animate-pulse bg-red-100 text-red-600" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"}`} aria-label={listening ? "หยุดฟัง" : "เริ่มพูดคำสั่ง"}><Mic className="size-5" /></button><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder={listening ? "กำลังฟัง..." : "ถามหรือสั่งงาน TEMS..."} className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white" /><button type="submit" disabled={!input.trim() || loading} className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"><Send className="size-5" /></button></div><p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><AlertTriangle className="size-3.5" />AI จะไม่ดำเนินการจนกว่าคุณตรวจสอบและกดยืนยัน</p></form>
    </section></div>}
  </>;
}
