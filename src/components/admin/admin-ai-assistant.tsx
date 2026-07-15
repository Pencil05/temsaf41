"use client";

import { AlertTriangle, Bot, CheckCircle2, ImagePlus, Mic, Send, ShieldCheck, Sparkles, X } from "lucide-react";
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

export function AdminAiAssistant() {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardRecordingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "สวัสดีครับ ผมช่วยค้นหาข้อมูลและเตรียมคำสั่งจัดการระบบให้ได้ ทุกคำสั่งแก้ไขจะรอให้คุณยืนยันก่อนเสมอ" }]);
  const [pending, setPending] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [evidenceImage, setEvidenceImage] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, pending]);
  useEffect(() => () => { recorderRef.current?.stop(); mediaStreamRef.current?.getTracks().forEach((track) => track.stop()); if (monitorFrameRef.current) cancelAnimationFrame(monitorFrameRef.current); void audioContextRef.current?.close(); }, []);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || loading) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setLoading(true);
    try {
      const recentMessages = messages.slice(-12);
      const firstUserIndex = recentMessages.findIndex((item) => item.role === "user");
      const history = (firstUserIndex >= 0 ? recentMessages.slice(firstUserIndex) : []).map((item) => ({ role: item.role, text: item.context || item.text }));
      const response = await fetch("/api/admin/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }) });
      const result = await response.json() as AssistantResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI ไม่สามารถตอบได้");
      const context = result.type === "proposal" ? `${result.message}\nข้อเสนอ=${JSON.stringify(result.payload || {})}` : result.message;
      setMessages((current) => [...current, { role: "assistant", text: result.message, context }]);
      setPending(result.type === "proposal" ? result : null);
      setEvidenceImage("");
      setEvidenceName("");
      setAdminPassword("");
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "AI ไม่สามารถตอบได้" }]);
    } finally { setLoading(false); }
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function stopMicrophone() {
    if (monitorFrameRef.current) cancelAnimationFrame(monitorFrameRef.current);
    monitorFrameRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function closeAssistant() {
    discardRecordingRef.current = true;
    stopMicrophone();
    setOpen(false);
  }

  function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์เสียงได้"));
      reader.readAsDataURL(blob);
    });
  }

  function audioBufferToWav(audioBuffer: AudioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const frameCount = audioBuffer.length;
    const dataLength = frameCount * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    const writeText = (offset: number, text: string) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, dataLength, true);
    const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sample = 0;
      for (const channel of channelData) sample += channel[frame] || 0;
      sample = Math.max(-1, Math.min(1, sample / channels));
      view.setInt16(44 + frame * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function toggleMicrophone() {
    if (listening) { stopMicrophone(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessages((current) => [...current, { role: "assistant", text: "เบราว์เซอร์นี้ไม่รองรับการอัดเสียง กรุณาใช้ Chrome, Edge หรือ Safari รุ่นล่าสุด" }]);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        setListening(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const decodingContext = audioContextRef.current;
        if (discardRecordingRef.current) { discardRecordingRef.current = false; if (decodingContext) await decodingContext.close().catch(() => undefined); audioContextRef.current = null; return; }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1_000 || !decodingContext) { if (decodingContext) await decodingContext.close().catch(() => undefined); audioContextRef.current = null; return; }
        setLoading(true);
        try {
          const decodedAudio = await decodingContext.decodeAudioData(await blob.arrayBuffer());
          const wavBlob = audioBufferToWav(decodedAudio);
          const audio = await blobToBase64(wavBlob);
          const response = await fetch("/api/admin/assistant/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio, mimeType: "audio/wav" }) });
          const result = await response.json() as { transcript?: string; error?: string };
          if (!response.ok || !result.transcript) throw new Error(result.error || "ถอดเสียงไม่สำเร็จ");
          setInput(result.transcript);
          setLoading(false);
          await sendMessage(result.transcript);
        } catch (error) {
          setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "ถอดเสียงไม่สำเร็จ" }]);
        } finally { await decodingContext.close().catch(() => undefined); audioContextRef.current = null; setLoading(false); }
      };
      recorderRef.current = recorder;
      discardRecordingRef.current = false;
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let noiseFloor = 0.008;
      let heardSpeech = false;
      let loudFrames = 0;
      let lastSpeechAt = startedAt;
      const monitor = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) { const normalized = (sample - 128) / 128; energy += normalized * normalized; }
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (now - startedAt < 500) noiseFloor = Math.max(noiseFloor, rms);
        const speechThreshold = Math.min(0.08, Math.max(0.018, noiseFloor * 2.4));
        if (rms > speechThreshold) { loudFrames += 1; if (loudFrames >= 3) { heardSpeech = true; lastSpeechAt = now; } }
        else loudFrames = 0;
        if ((heardSpeech && now - lastSpeechAt > 1_150) || now - startedAt > 15_000) { stopMicrophone(); return; }
        monitorFrameRef.current = requestAnimationFrame(monitor);
      };
      setInput("");
      setListening(true);
      recorder.start(250);
      monitorFrameRef.current = requestAnimationFrame(monitor);
    } catch (error) {
      setListening(false);
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error && error.name === "NotAllowedError" ? "กรุณาอนุญาตการใช้ไมโครโฟนก่อน" : "ไม่สามารถเปิดไมโครโฟนได้" }]);
    }
  }

  async function attachEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessages((current) => [...current, { role: "assistant", text: "กรุณาเลือกรูปหลักฐานขนาดไม่เกิน 5 MB" }]);
      return;
    }
    setLoading(true);
    try { setEvidenceImage(await compressImageForSheet(file)); setEvidenceName(file.name); }
    catch (error) { setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "เตรียมรูปไม่สำเร็จ" }]); }
    finally { setLoading(false); }
  }

  async function execute() {
    if (!pending?.payload || loading) return;
    const action = String(pending.payload.action || "");
    if (action === "report-defect" && !evidenceImage) return;
    if (action === "delete-company" && !adminPassword) return;
    setLoading(true);
    try {
      const payload = { ...pending.payload, ...(action === "report-defect" ? { evidenceImage } : {}), ...(action === "delete-company" ? { adminPassword } : {}) };
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ดำเนินการไม่สำเร็จ");
      setMessages((current) => [...current, { role: "assistant", text: "ดำเนินการสำเร็จและบันทึก Audit Log เรียบร้อยแล้ว" }]);
      setPending(null);
      setEvidenceImage("");
      setAdminPassword("");
      router.refresh();
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[70] flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 font-bold text-white shadow-2xl transition hover:-translate-y-1 hover:shadow-blue-500/30" aria-label="เปิด AI ผู้ช่วย"><Sparkles className="size-5" /><span className="hidden sm:inline">AI ผู้ช่วย</span></button>
      {open && <div className="fixed inset-0 z-[150] flex items-end justify-end bg-slate-950/30 p-0 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssistant(); }}>
        <section className="popup-panel flex h-[min(760px,94dvh)] w-full flex-col overflow-hidden rounded-t-[28px] border border-blue-200 bg-white shadow-2xl sm:w-[430px] sm:rounded-[28px]">
          <header className="flex items-center gap-3 bg-gradient-to-r from-[#103b68] to-[#1984c8] p-4 text-white"><span className="grid size-11 place-items-center rounded-2xl bg-white/15"><Bot className="size-6" /></span><span className="min-w-0 flex-1"><span className="block font-bold">TEMS AI ผู้ช่วยผู้ดูแล</span><span className="block text-xs text-blue-100">Gemini 3.1 Flash-Lite · จำบริบทการสนทนา</span></span><button type="button" onClick={closeAssistant} className="grid size-10 place-items-center rounded-xl hover:bg-white/10"><X className="size-5" /></button></header>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message, index) => <div key={index} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>{message.text}</div>)}
            {loading && <div className="flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><Sparkles className="size-4 animate-pulse text-blue-600" />กำลังประมวลผล...</div>}
            {pending && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><div className="flex gap-2 text-amber-800"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">ตรวจสอบก่อนยืนยัน</p><p className="mt-1 text-sm leading-6">{pending.summary || pending.message}</p></div></div>{pending.payload?.action === "report-defect" && <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-orange-300 bg-white p-3"><span className="grid size-11 place-items-center overflow-hidden rounded-lg bg-orange-50">{evidenceImage ? <Image src={evidenceImage} alt="หลักฐาน" width={44} height={44} unoptimized className="size-full object-cover" /> : <ImagePlus className="size-5 text-orange-600" />}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{evidenceName || "แนบรูปหลักฐานก่อนยืนยัน"}</span><input type="file" accept="image/*" onChange={attachEvidence} className="sr-only" /></label>}{pending.payload?.action === "delete-company" && <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-red-700">รหัสผ่านผู้ดูแลระบบ</span><input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="h-11 w-full rounded-xl border border-red-200 bg-white px-3" autoComplete="current-password" /></label>}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPending(null)} className="h-11 rounded-xl bg-white font-bold text-slate-600">ยกเลิก</button><button type="button" onClick={execute} disabled={loading || (pending.payload?.action === "report-defect" && !evidenceImage) || (pending.payload?.action === "delete-company" && !adminPassword)} className="h-11 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-50"><CheckCircle2 className="mr-1 inline size-4" />ยืนยันดำเนินการ</button></div></div>}
          </div>
          <form onSubmit={ask} className="border-t border-slate-200 bg-white p-3"><div className="flex items-end gap-2"><button type="button" onClick={toggleMicrophone} className={`grid size-11 shrink-0 place-items-center rounded-xl ${listening ? "bg-red-100 text-red-600 animate-pulse" : "bg-blue-50 text-blue-600"}`}><Mic className="size-5" /></button><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder="พิมพ์หรือพูดคำสั่ง..." className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" /><button type="submit" disabled={!input.trim() || loading} className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-40"><Send className="size-5" /></button></div><p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><AlertTriangle className="size-3.5" />ตรวจสอบชื่อ กองร้อย จำนวน และทะเบียนก่อนยืนยันทุกครั้ง</p></form>
        </section>
      </div>}
    </>
  );
}
