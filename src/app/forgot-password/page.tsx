"use client";

import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OtpPasswordForm } from "@/components/account/otp-password-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function ForgotPasswordPage() {
  const router = useRouter();

  return (
    <main className="theme-auth-page relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-6">
      <ThemeToggle className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5" />
      <div className="login-glow login-glow-top" />
      <div className="login-glow login-glow-middle" />
      <div className="login-glow login-glow-bottom" />

      <section className="relative z-10 w-full max-w-md">
        <div className="rounded-[30px] border border-white/80 bg-white/78 p-6 shadow-[0_24px_60px_rgba(78,94,164,0.18)] backdrop-blur-xl sm:p-7">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition hover:text-blue-700">
            <ArrowLeft className="size-4" />
            กลับหน้าเข้าสู่ระบบ
          </Link>

          <div className="mt-5 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-blue-100 text-blue-600 shadow-sm">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">ลืมรหัสผ่าน</h1>
              <p className="text-sm text-slate-500">ยืนยันตัวตนผ่าน Gmail สำหรับกู้คืนบัญชี</p>
            </div>
          </div>

          <div className="mt-6">
            <OtpPasswordForm
              purpose="forgot"
              onCompleted={() => {
                window.setTimeout(() => router.replace("/"), 1200);
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
