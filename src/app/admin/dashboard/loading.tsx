import { LoaderCircle, ShieldCheck } from "lucide-react";

export default function AdminDashboardLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 text-slate-900">
      <div className="text-center" role="status" aria-live="polite">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <ShieldCheck className="size-8" />
        </span>
        <div className="mt-6 flex items-center justify-center gap-2 text-blue-600">
          <LoaderCircle className="size-5 animate-spin" />
          <span className="font-semibold">กำลังเตรียม Admin Dashboard...</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">กำลังอ่านข้อมูลล่าสุดจากคลังส่วนกลาง</p>
      </div>
    </main>
  );
}
