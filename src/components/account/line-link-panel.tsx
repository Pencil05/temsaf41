"use client";

import { CheckCircle2, Clipboard, ExternalLink, Link2, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import type { AccountProfile } from "@/lib/account-service";

type LineStatus = {
  linked: boolean;
  displayName: string;
  notifyEnabled: boolean;
  linkedAt: string;
};

export function LineLinkPanel({ profile }: { profile: AccountProfile }) {
  const [status, setStatus] = useState<LineStatus>({
    linked: profile.lineLinked,
    displayName: profile.lineDisplayName,
    notifyEnabled: profile.lineNotifyEnabled,
    linkedAt: profile.lineLinkedAt,
  });
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const addFriendUrl = process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL || "";

  async function refreshStatus() {
    setLoading(true);
    const response = await fetch("/api/line/link", { cache: "no-store" });
    const data = await response.json() as LineStatus & { error?: string };
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "ตรวจสอบสถานะไม่สำเร็จ");
    setStatus(data);
    if (data.linked) {
      setCode("");
      setMessage("เชื่อมต่อ LINE สำเร็จแล้ว");
    }
  }

  async function createCode() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/line/link", { method: "POST" });
    const data = await response.json() as { code?: string; expiresAt?: string; error?: string };
    setLoading(false);
    if (!response.ok || !data.code) return setMessage(data.error || "สร้างรหัสเชื่อมต่อไม่สำเร็จ");
    setCode(data.code);
    setExpiresAt(data.expiresAt || "");
  }

  async function unlinkAccount() {
    if (!window.confirm("ยืนยันยกเลิกการเชื่อมต่อ LINE OA?")) return;
    setLoading(true);
    const response = await fetch("/api/line/link", { method: "DELETE" });
    const data = await response.json() as { error?: string };
    setLoading(false);
    if (!response.ok) return setMessage(data.error || "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
    setStatus({ linked: false, displayName: "", notifyEnabled: false, linkedAt: "" });
    setMessage("ยกเลิกการเชื่อมต่อ LINE แล้ว");
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setMessage("คัดลอกรหัสแล้ว กรุณาส่งรหัสนี้หา LINE OA");
  }

  return (
    <div className="mt-7 border-t border-slate-200 pt-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#06c755] text-white shadow-sm">
              {status.linked ? <CheckCircle2 className="size-5" /> : <Link2 className="size-5" />}
            </span>
            <div>
              <h2 className="font-bold text-slate-900">การแจ้งเตือนผ่าน LINE OA</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {status.linked ? `เชื่อมต่อแล้ว${status.displayName ? ` · ${status.displayName}` : ""}` : "เชื่อมบัญชีเพื่อรับเฉพาะแจ้งเตือนของกองร้อยคุณ"}
              </p>
            </div>
          </div>
          {status.linked ? (
            <div className="flex gap-2">
              <button type="button" disabled={loading} onClick={refreshStatus} className="grid size-11 place-items-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50" aria-label="ตรวจสอบสถานะ LINE">
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button type="button" disabled={loading} onClick={unlinkAccount} className="flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                <Unlink className="size-4" /> ยกเลิกการเชื่อมต่อ
              </button>
            </div>
          ) : (
            <button type="button" disabled={loading} onClick={createCode} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#06c755] px-5 font-bold text-white transition hover:bg-[#05b84e] disabled:opacity-60">
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />} สร้างรหัสเชื่อมต่อ
            </button>
          )}
        </div>

        {code && !status.linked && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">ส่งรหัสนี้ในแชต LINE OA ภายใน 10 นาที</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={copyCode} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-lg font-black tracking-wider text-white">
                <Clipboard className="size-4" /> {code}
              </button>
              {addFriendUrl && <a href={addFriendUrl} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#06c755] px-5 font-bold text-white"><ExternalLink className="size-4" /> เปิด LINE OA</a>}
              <button type="button" onClick={refreshStatus} disabled={loading} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> ตรวจสอบ</button>
            </div>
            {expiresAt && <p className="mt-2 text-xs text-slate-500">รหัสหมดอายุ {new Date(expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</p>}
          </div>
        )}
        {message && <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
      </div>
    </div>
  );
}
