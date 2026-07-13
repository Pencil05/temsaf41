"use client";

import { KeyRound, LoaderCircle, Phone, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

type Stage = "phone" | "otp" | "password";

export function OtpPasswordForm({ purpose, email, defaultPhone = "" }: { purpose: "change" | "forgot"; email?: string; defaultPhone?: string }) {
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, email, phone }) });
      const data = (await response.json()) as { error?: string; maskedPhone?: string; developmentOtp?: string };
      if (!response.ok) return setError(data.error || "ส่ง OTP ไม่สำเร็จ");
      setStage("otp");
      setMessage(data.developmentOtp
        ? `โหมดทดสอบ: ยังไม่ได้เชื่อม SMS Gateway · ใช้รหัส ${data.developmentOtp}`
        : `ส่ง OTP ไปยัง ${data.maskedPhone} แล้ว`);
    } catch { setError("ไม่สามารถเชื่อมต่อบริการ SMS ได้"); }
    finally { setLoading(false); }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, email, phone, otp }) });
      const data = (await response.json()) as { error?: string; verificationToken?: string };
      if (!response.ok || !data.verificationToken) return setError(data.error || "OTP ไม่ถูกต้อง");
      setVerificationToken(data.verificationToken); setStage("password"); setMessage("ยืนยันเบอร์โทรศัพท์สำเร็จ กรุณาตั้งรหัสผ่านใหม่");
    } catch { setError("ไม่สามารถยืนยัน OTP ได้"); }
    finally { setLoading(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, email, verificationToken, password }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) return setError(data.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      setMessage("บันทึกเบอร์โทรศัพท์และเปลี่ยนรหัสผ่านเรียบร้อยแล้ว"); setPassword(""); setConfirmation(""); setOtp(""); setStage("phone");
    } catch { setError("ไม่สามารถเปลี่ยนรหัสผ่านได้"); }
    finally { setLoading(false); }
  }

  return <div className="space-y-4">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600"><KeyRound className="size-5" /></span><div><h2 className="font-bold">{purpose === "forgot" ? "ตั้งรหัสผ่านใหม่" : "เปลี่ยนรหัสผ่าน"}</h2><p className="text-xs text-slate-500">กรอกเบอร์ → ยืนยัน OTP → ตั้งรหัสผ่าน</p></div></div>
    {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    {stage === "phone" && <form onSubmit={requestOtp} className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">เบอร์โทรศัพท์มือถือ</span><div className="relative"><Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^\d+ -]/g, "").slice(0, 16))} inputMode="tel" autoComplete="tel" placeholder="0812345678" className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3" required /></div><span className="mt-1 block text-xs text-slate-500">เมื่อยืนยัน OTP สำเร็จ ระบบจะบันทึกเบอร์นี้ใน Users.Phone</span></label><button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-indigo-600 font-bold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}ขอรหัส OTP</button></form>}

    {stage === "otp" && <form onSubmit={verifyOtp} className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">รหัส OTP 6 หลัก</span><input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-center text-lg tracking-[0.35em]" required /></label><button disabled={loading || otp.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 font-bold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}ยืนยัน OTP</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setStage("phone"); setOtp(""); }} className="h-10 rounded-full bg-slate-100 text-sm font-semibold text-slate-600">แก้ไขเบอร์</button><button type="button" onClick={() => requestOtp()} disabled={loading} className="h-10 rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">ส่ง OTP อีกครั้ง</button></div></form>}

    {stage === "password" && <form onSubmit={resetPassword} className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">รหัสผ่านใหม่</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" className="h-12 w-full rounded-xl border border-slate-200 px-3" required /></label><label className="block"><span className="mb-2 block text-sm font-semibold">ยืนยันรหัสผ่านใหม่</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} autoComplete="new-password" className="h-12 w-full rounded-xl border border-slate-200 px-3" required /></label><button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 font-bold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}บันทึกรหัสผ่านใหม่</button></form>}
  </div>;
}
