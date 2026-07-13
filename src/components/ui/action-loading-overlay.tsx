import { LoaderCircle } from "lucide-react";

export function ActionLoadingOverlay({ message = "กำลังโหลดข้อมูล กรุณารอสักครู่..." }: { message?: string }) {
  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-[200] max-w-[calc(100vw-1.5rem)] sm:right-5 sm:top-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white/95 px-3.5 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.16)] backdrop-blur-xl">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          <span className="absolute inset-1 animate-ping rounded-lg bg-blue-200/60" />
          <LoaderCircle className="relative size-5 animate-spin" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 sm:text-sm">{message}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">ระบบกำลังประมวลผล</p>
        </div>
      </div>
    </div>
  );
}
