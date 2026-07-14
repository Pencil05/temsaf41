"use client";

import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Stage = "gmail" | "otp" | "password" | "done";

type OtpPasswordFormProps = {
  purpose: "change" | "forgot";
  email?: string;
  defaultGmail?: string;
  onCompleted?: () => void;
};

function passwordChecklist(password: string) {
  return [
    { label: "อย่างน้อย 8 ตัวอักษร", valid: password.length >= 8 },
    { label: "มีตัวอักษรภาษาอังกฤษ", valid: /[A-Za-z]/.test(password) },
    { label: "มีตัวเลขอย่างน้อย 1 ตัว", valid: /\d/.test(password) },
  ];
}

export function OtpPasswordForm({ purpose, email, defaultGmail = "", onCompleted }: OtpPasswordFormProps) {
  const [stage, setStage] = useState<Stage>("gmail");
  const [gmail, setGmail] = useState(defaultGmail);
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [maskedEmail, setMaskedEmail] = useState("");

  const checklist = useMemo(() => passwordChecklist(password), [password]);
  const passwordReady = checklist.every((item) => item.valid);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timeout = window.setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [secondsLeft]);

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, email, gmail }),
      });

      const data = (await response.json()) as {
        error?: string;
        maskedEmail?: string;
        challengeToken?: string;
        expiresInSeconds?: number;
      };

      if (!response.ok || !data.challengeToken) {
        setError(data.error || "ส่ง OTP ไม่สำเร็จ");
        return;
      }

      setChallengeToken(data.challengeToken);
      setMaskedEmail(data.maskedEmail || "");
      setSecondsLeft(data.expiresInSeconds || 300);
      setStage("otp");
      setOtp("");
      setMessage(`ส่ง OTP ไปยัง ${data.maskedEmail} แล้ว`);
    } catch {
      setError("ไม่สามารถเชื่อมต่อบริการส่ง OTP ได้");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, email, gmail, otp, challengeToken }),
      });

      const data = (await response.json()) as { error?: string; verificationToken?: string };

      if (!response.ok || !data.verificationToken) {
        setError(data.error || "OTP ไม่ถูกต้อง");
        return;
      }

      setVerificationToken(data.verificationToken);
      setStage("password");
      setMessage("ยืนยัน Gmail สำเร็จ กรุณาตั้งรหัสผ่านใหม่");
    } catch {
      setError("ไม่สามารถยืนยัน OTP ได้");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!passwordReady) {
      setError("กรุณาตั้งรหัสผ่านให้ครบตามเงื่อนไข");
      return;
    }

    if (password !== confirmation) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/otp/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, email, gmail, verificationToken, password }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }

      setMessage(
        purpose === "forgot"
          ? "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว สามารถกลับไปเข้าสู่ระบบได้ทันที"
          : "อัปเดต Gmail กู้คืนและเปลี่ยนรหัสผ่านเรียบร้อยแล้ว",
      );
      setPassword("");
      setConfirmation("");
      setOtp("");
      setVerificationToken("");
      setChallengeToken("");
      setStage("done");
      onCompleted?.();
    } catch {
      setError("ไม่สามารถเปลี่ยนรหัสผ่านได้");
    } finally {
      setLoading(false);
    }
  }

  function resetFlow() {
    setStage("gmail");
    setOtp("");
    setPassword("");
    setConfirmation("");
    setChallengeToken("");
    setVerificationToken("");
    setSecondsLeft(0);
    setError("");
  }

  return (
    <div className="space-y-5">


      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Gmail", active: stage === "gmail" },
          { label: "OTP", active: stage === "otp" },
          { label: "รหัสใหม่", active: stage === "password" },
          { label: "เสร็จสิ้น", active: stage === "done" },
        ].map((item, index) => (
          <div
            key={item.label}
            className={`rounded-2xl px-3 py-2 text-center text-xs font-semibold transition ${
              item.active
                ? "bg-indigo-600 text-white shadow-md"
                : index < ["gmail", "otp", "password", "done"].indexOf(stage)
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>

      {message && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {stage === "gmail" && (
        <form onSubmit={requestOtp} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Gmail สำหรับรับ OTP</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={gmail}
                onChange={(event) => setGmail(event.target.value)}
                autoComplete="email"
                placeholder="example@gmail.com"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                required
              />
            </div>
          </label>

          <button
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-indigo-600 font-bold text-white shadow-[0_12px_26px_rgba(79,70,229,0.25)] transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
            ขอรหัส OTP
          </button>
        </form>
      )}

      {stage === "otp" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            ยืนยันรหัส 6 หลักที่ส่งไปยัง <span className="font-bold text-slate-900">{maskedEmail}</span>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">รหัส OTP</span>
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-center text-lg tracking-[0.35em] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              required
            />
          </label>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>รหัสมีอายุอีกประมาณ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} นาที</span>
            <button
              type="button"
              onClick={() => void requestOtp()}
              disabled={loading || secondsLeft > 240}
              className="font-semibold text-indigo-600 disabled:text-slate-400"
            >
              ส่งอีกครั้ง
            </button>
          </div>

          <button
            disabled={loading || otp.length !== 6}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 font-bold text-white shadow-[0_12px_26px_rgba(5,150,105,0.25)] transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            ยืนยัน OTP
          </button>

          <button
            type="button"
            onClick={resetFlow}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-100 font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <ArrowLeft className="size-4" />
            กลับไปแก้ไข Gmail
          </button>
        </form>
      )}

      {stage === "password" && (
        <form onSubmit={resetPassword} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">รหัสผ่านใหม่</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">ยืนยันรหัสผ่านใหม่</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              required
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">เงื่อนไขรหัสผ่าน</p>
            <div className="space-y-1.5">
              {checklist.map((item) => (
                <p key={item.label} className={`text-xs ${item.valid ? "text-emerald-700" : "text-slate-500"}`}>
                  {item.valid ? "ผ่าน" : "รอ"} {item.label}
                </p>
              ))}
            </div>
          </div>

          <button
            disabled={loading || !passwordReady}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 font-bold text-white shadow-[0_12px_26px_rgba(5,150,105,0.25)] transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            บันทึกรหัสผ่านใหม่
          </button>
        </form>
      )}

      {stage === "done" && (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-6 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">บันทึกสำเร็จ</h3>
            <p className="mt-1 text-sm text-slate-500">
              {purpose === "forgot" ? "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว" : "ข้อมูลความปลอดภัยของบัญชีถูกอัปเดตแล้ว"}
            </p>
          </div>

          <button
            type="button"
            onClick={resetFlow}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-100 font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <ArrowRight className="size-4" />
            ทำรายการอีกครั้ง
          </button>
        </div>
      )}
    </div>
  );
}

