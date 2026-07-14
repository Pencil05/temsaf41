"use client";

import { KeyRound, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AccountProfile } from "@/lib/account-service";
import { OtpPasswordForm } from "@/components/account/otp-password-form";
import { ProfileForm } from "@/components/account/profile-form";

export function SettingsProfilePanel({ profile }: { profile: AccountProfile }) {
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (!passwordOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPasswordOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [passwordOpen]);

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:p-7">
        <ProfileForm profile={profile} />

        <div className="mt-7 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">ความปลอดภัยของบัญชี</h2>
                <p className="mt-0.5 text-sm text-slate-500">ยืนยันตัวตนด้วย OTP ก่อนตั้งรหัสผ่านใหม่</p>
              </div>
            </div>
            <button type="button" onClick={() => setPasswordOpen(true)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 font-bold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700">
              <KeyRound className="size-4" />
              เปลี่ยนรหัสผ่าน
            </button>
          </div>
        </div>
      </section>

      {passwordOpen && (
        <div className="popup-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="เปลี่ยนรหัสผ่าน" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordOpen(false); }}>
          <div className="popup-panel max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-[30px] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Account Security</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">เปลี่ยนรหัสผ่าน</h2>
              </div>
              <button type="button" onClick={() => setPasswordOpen(false)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900" aria-label="ปิดหน้าต่าง">
                <X className="size-5" />
              </button>
            </div>
            <OtpPasswordForm purpose="change" defaultGmail={profile.gmail} onCompleted={() => window.setTimeout(() => setPasswordOpen(false), 1400)} />
          </div>
        </div>
      )}
    </>
  );
}
