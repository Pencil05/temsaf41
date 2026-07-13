import { ArrowLeft, CalendarClock, History, PackageCheck } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getUserTransactionHistory } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "ไม่ระบุวันที่"
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function UserHistoryPage() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") redirect("/");
  const history = await getUserTransactionHistory(user);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] bg-gradient-to-br from-blue-700 to-indigo-600 p-6 text-white shadow-xl shadow-blue-100">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-100 hover:text-white">
            <ArrowLeft className="size-4" /> กลับหน้าหลัก
          </Link>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/15"><History className="size-6" /></span>
            <div><p className="text-sm text-blue-100">TEMS</p><h1 className="text-2xl font-bold">ประวัติการเบิก / คืน</h1></div>
          </div>
        </header>

        <section className="mt-6 space-y-3">
          {history.length ? history.map((item) => {
            const returned = item.status.toLowerCase() === "returned";
            return (
              <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <div className="flex items-start gap-3">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${returned ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}><PackageCheck className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3"><h2 className="font-bold text-slate-800">{item.equipmentName}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${returned ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{returned ? "คืนแล้ว" : item.status}</span></div>
                    <p className="mt-1 text-sm text-slate-600">จำนวน {item.quantity.toLocaleString("th-TH")} · {item.ownerCompanyName} → {item.borrowerCompanyName}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><CalendarClock className="size-3.5" />{formatDate(item.date)}</p>
                    <p className="mt-2 text-xs text-slate-500">หมายเหตุ: {item.note}</p>
                  </div>
                </div>
              </article>
            );
          }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการทำรายการ</div>}
        </section>
      </div>
    </main>
  );
}
