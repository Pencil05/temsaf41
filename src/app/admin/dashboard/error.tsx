"use client";

import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function AdminDashboardError({ reset }: { reset: () => void }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function logout() {
    setIsLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-5 text-slate-900">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-900/10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold">โหลด Admin Dashboard ไม่สำเร็จ</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          กรุณาตรวจสอบการเชื่อมต่อแล้วลองโหลดข้อมูลอีกครั้ง
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 font-bold text-white transition hover:bg-blue-700 active:scale-[0.98]"
        >
          <RefreshCw className="size-5" />
          ลองใหม่
        </button>
        <button
          type="button"
          onClick={logout}
          disabled={isLoggingOut}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 font-semibold text-slate-600 transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-60"
        >
          <LogOut className="size-4" />
          {isLoggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </button>
      </section>
    </main>
  );
}
