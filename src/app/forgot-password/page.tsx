"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OtpPasswordForm } from "@/components/account/otp-password-form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-100 via-purple-50 to-blue-100 px-4 py-8"><div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-2xl backdrop-blur-xl"><Link href="/" className="inline-flex items-center gap-2 text-sm text-blue-600"><ArrowLeft className="size-4" />กลับหน้าเข้าสู่ระบบ</Link><h1 className="mt-5 text-2xl font-bold">ลืมรหัสผ่าน</h1><p className="mt-1 text-sm text-slate-500">รับ OTP ผ่านเบอร์มือถือที่ลงทะเบียนไว้</p>{!ready ? <form onSubmit={(event) => { event.preventDefault(); setReady(true); }} className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">อีเมล</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3" required /></label><button className="h-12 w-full rounded-full bg-blue-600 font-bold text-white">ดำเนินการต่อ</button></form> : <div className="mt-6"><OtpPasswordForm purpose="forgot" email={email} /></div>}</div></main>;
}
