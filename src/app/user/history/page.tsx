import { ArrowLeft, History } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getUserTransactionHistory } from "@/lib/google-sheets";
import { HistoryClient } from "@/components/history/history-client";

export const dynamic = "force-dynamic";

export default async function UserHistoryPage({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") redirect("/");
  const history = await getUserTransactionHistory(user);
  const { tx } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl lg:max-w-7xl">
        <header className="linear-dark-panel rounded-[28px] bg-gradient-to-br from-blue-700 to-indigo-600 p-6 text-white shadow-xl shadow-blue-100">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-100 hover:text-white">
            <ArrowLeft className="size-4" /> กลับหน้าหลัก
          </Link>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/15"><History className="size-6" /></span>
            <div><p className="text-sm text-blue-100">TEMS</p><h1 className="text-2xl font-bold">ประวัติการเบิก / คืน</h1></div>
          </div>
        </header>

        <HistoryClient items={history} initialTx={tx} />
      </div>
    </main>
  );
}
