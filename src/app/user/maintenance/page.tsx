import { ArrowLeft, CheckCircle2, Wrench } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryClient } from "@/components/history/history-client";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getUserTransactionHistory } from "@/lib/google-sheets";
import { getDashboardActionData } from "@/lib/inventory-action-service";

export const dynamic = "force-dynamic";

export default async function UserMaintenancePage({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") redirect("/");
  const [allHistory, actions] = await Promise.all([getUserTransactionHistory(user), getDashboardActionData(user)]);
  const history = allHistory.filter((item) => item.movementType === "defect");
  const active = history.filter((item) => item.status.toLowerCase() !== "completed").length;
  const completed = history.length - active;
  const { tx } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl lg:max-w-7xl">
        <header className="linear-dark-panel rounded-[28px] bg-gradient-to-br from-orange-600 to-red-600 p-6 text-white shadow-xl shadow-orange-100">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 text-sm text-orange-100 hover:text-white"><ArrowLeft className="size-4" />กลับหน้าหลัก</Link>
          <div className="mt-5 flex items-center gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-white/15"><Wrench className="size-6" /></span><div><p className="text-sm text-orange-100">Maintenance Center</p><h1 className="text-2xl font-bold">ยุทโธปกรณ์ชำรุด</h1><p className="mt-1 text-sm text-orange-100">ติดตามสถานะและเปิดดูประวัติการแจ้งซ่อม</p></div></div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm"><Wrench className="size-5 text-orange-600" /><p className="mt-4 text-sm text-slate-500">กำลังดำเนินการ</p><p className="text-3xl font-bold text-orange-700">{active.toLocaleString("th-TH")}</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"><CheckCircle2 className="size-5 text-emerald-600" /><p className="mt-4 text-sm text-slate-500">ซ่อมเสร็จแล้ว</p><p className="text-3xl font-bold text-emerald-700">{completed.toLocaleString("th-TH")}</p></div>
        </section>

        <DashboardActions data={actions} showReturn={false} />

        <div className="mt-6"><div><p className="text-sm font-semibold text-orange-600">ประวัติทั้งหมด</p><h2 className="text-xl font-bold text-slate-900">รายการแจ้งเสียและผลการซ่อม</h2></div><HistoryClient items={history} initialTx={tx} /></div>
      </div>
    </main>
  );
}
