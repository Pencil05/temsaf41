"use client";

import { History, Home, LogOut, Menu, PackageSearch, Search, Settings, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AccountProfile } from "@/lib/account-service";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";

const shortcuts = [
  { label: "หน้าหลัก", href: "/user/dashboard", Icon: Home },
  { label: "เบิกยุทโธปกรณ์", href: "/user/borrow", Icon: PackageSearch },
  { label: "ประวัติการเบิก / คืน", href: "/user/history", Icon: History },
  { label: "ตั้งค่าโปรไฟล์", href: "/user/settings", Icon: Settings },
];

export function UserShell({ profile, children }: { profile: AccountProfile; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState(profile);
  const [navigating, setNavigating] = useState(false);
  const results = useMemo(() => query ? shortcuts.filter((item) => item.label.includes(query.trim())) : [], [query]);

  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then((response) => response.ok ? response.json() as Promise<AccountProfile> : null)
      .then((nextProfile) => {
        if (active && nextProfile) setAccount(nextProfile);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setNavigating(false), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  async function logout() {
    setNavigating(true);
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("tems-auth-user");
    router.replace("/");
    router.refresh();
  }

  const navigation = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="text-xs font-bold tracking-[0.18em] text-blue-600">TEMS</p><p className="font-bold text-slate-900">Wing 41</p></div><button onClick={() => setOpen(false)} className="lg:hidden"><X className="size-5" /></button></div>
      <div className="flex items-center gap-3 p-5">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-blue-600">
          {account.profileImage ? <Image src={account.profileImage} alt="รูปโปรไฟล์" width={48} height={48} unoptimized className="size-12 object-cover" /> : <UserRound className="size-6" />}
        </span>
        <div className="min-w-0"><p className="truncate text-sm font-bold">{account.rank} {account.firstName} {account.lastName}</p><p className="truncate text-xs text-slate-500">{account.email}</p></div>
      </div>
      <nav className="flex-1 space-y-1 px-3">{shortcuts.map(({ label, href, Icon }) => <Link key={href} href={href} onClick={() => { setOpen(false); if (pathname !== href) setNavigating(true); }} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${pathname === href ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="size-5" />{label}</Link>)}</nav>
      <button onClick={logout} className="m-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="size-5" />ออกจากระบบ</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {navigating && <ActionLoadingOverlay message="กำลังโหลดหน้าและข้อมูลล่าสุด..." />}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 border-r border-slate-200 bg-white lg:block">{navigation}</aside>
      {open && <div className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-[84%] max-w-xs bg-white" onClick={(event) => event.stopPropagation()}>{navigation}</aside></div>}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center gap-3"><button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-xl bg-slate-100 lg:hidden"><Menu className="size-5" /></button><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเมนูหรือทางลัด..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />{results.length > 0 && <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">{results.map(({ label, href, Icon }) => <Link key={href} href={href} onClick={() => { setQuery(""); if (pathname !== href) setNavigating(true); }} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-blue-50"><Icon className="size-4 text-blue-600" />{label}</Link>)}</div>}</div></div>
        </header>
        {children}
      </div>
    </div>
  );
}
