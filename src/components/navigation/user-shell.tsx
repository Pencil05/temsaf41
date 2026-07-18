"use client";

import { Boxes, History, Home, LogOut, Menu, PackageSearch, RefreshCw, RotateCcw, Search, Settings, UserRound, Wrench, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserAiAssistant } from "@/components/user/user-ai-assistant";
import type { AccountProfile } from "@/lib/account-service";
import type { GlobalSearchItem } from "@/lib/google-sheets";

const shortcuts = [
  { label: "หน้าหลัก", href: "/user/dashboard", Icon: Home, tone: "bg-sky-100 text-sky-700" },
  { label: "เบิกยุทโธปกรณ์", href: "/user/borrow", Icon: PackageSearch, tone: "bg-cyan-100 text-cyan-700" },
  { label: "คืนยุทโธปกรณ์", href: "/user/dashboard?action=return", Icon: RotateCcw, tone: "bg-emerald-100 text-emerald-700" },
  { label: "ประวัติการเบิก / คืน", href: "/user/history", Icon: History, tone: "bg-amber-100 text-amber-700" },
  { label: "ยุทโธปกรณ์ชำรุด", href: "/user/maintenance", Icon: Wrench, tone: "bg-orange-100 text-orange-700" },
  { label: "ตั้งค่าโปรไฟล์", href: "/user/settings", Icon: Settings, tone: "bg-indigo-100 text-indigo-700" },
];

export function UserShell({ profile, searchItems, children }: { profile: AccountProfile; searchItems: GlobalSearchItem[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState(profile);
  const [navigating, setNavigating] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("th");
    if (!keyword) return [];

    const menuResults = shortcuts
      .filter((item) => item.label.toLocaleLowerCase("th").includes(keyword))
      .map((item) => ({
        id: `menu:${item.href}`,
        label: item.label,
        description: "เมนู",
        href: item.href,
        kind: "menu" as const,
        Icon: item.Icon,
      }));

    const equipmentResults = searchItems
      .filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase("th").includes(keyword))
      .map((item) => ({ ...item, Icon: item.kind === "category" ? Boxes : PackageSearch }));

    return [...menuResults, ...equipmentResults].slice(0, 10);
  }, [query, searchItems]);

  useEffect(() => {
    const closeOnScroll = () => setSearchOpen(false);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => window.removeEventListener("scroll", closeOnScroll, true);
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/profile")
      .then((response) => (response.ok ? (response.json() as Promise<AccountProfile>) : null))
      .then((nextProfile) => {
        if (active && nextProfile) {
          setAccount(nextProfile);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
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

  function refreshPage() {
    startRefresh(() => router.refresh());
  }

  const navigation = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Image src="/changprai.png" alt="ตรากองพันทหารอากาศโยธิน" width={44} height={44} priority className="size-full object-contain" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600">TEMS</p>
            <p className="font-bold text-slate-900">Wing 41</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl bg-slate-100 lg:hidden">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex items-center gap-3 p-5">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-blue-600">
          {account.profileImage ? (
            <Image src={account.profileImage} alt="รูปโปรไฟล์" width={48} height={48} unoptimized className="size-12 object-cover" />
          ) : (
            <UserRound className="size-6" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{account.rank} {account.firstName} {account.lastName}</p>
          <p className="truncate text-xs text-slate-500">{account.email}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {shortcuts.map(({ label, href, Icon, tone }) => {
          const active = href === "/user/dashboard"
            ? pathname === "/user/dashboard" && searchParams.get("action") !== "return"
            : href === "/user/dashboard?action=return"
              ? pathname === "/user/dashboard" && searchParams.get("action") === "return"
              : pathname === href;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => {
                setOpen(false);
                if (pathname !== href) {
                  setNavigating(true);
                }
              }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                active
                  ? "linear-dark-primary bg-gradient-to-r from-[#123a66] to-blue-600 text-white shadow-md"
                  : "text-slate-600 hover:bg-slate-100 active:bg-sky-100"
              }`}
            >
              <span className={`grid size-9 place-items-center rounded-lg ${active ? "bg-white/15 text-[#f4d878]" : tone}`}>
                <Icon className="size-[18px]" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={logout}
        className="logout-button m-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-700 shadow-md hover:bg-red-100 active:bg-red-100"
      >
        <span className="grid size-9 place-items-center rounded-lg bg-red-100 text-red-700">
          <LogOut className="size-5" />
        </span>
        ออกจากระบบ
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {(navigating || isRefreshing) && (
        <ActionLoadingOverlay message={isRefreshing ? "กำลังรีเฟรชข้อมูลล่าสุด..." : "กำลังโหลดหน้าและข้อมูลล่าสุด..."} />
      )}

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 border-r border-slate-200 bg-white lg:block">{navigation}</aside>

      <div
        className={`fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300 ease-out lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      >
        <aside
          className={`h-full w-[84%] max-w-xs bg-white shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {navigation}
        </aside>
      </div>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center gap-3 lg:max-w-7xl">
            <button
              onClick={() => setOpen(true)}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu className="size-5" strokeWidth={2.25} />
            </button>

            <div ref={searchBoxRef} className="relative flex-1" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelectedResult(0); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setSearchOpen(true); setSelectedResult((current) => Math.max(0, Math.min(results.length - 1, current + 1))); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setSelectedResult((current) => Math.max(0, current - 1)); }
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && results[selectedResult]) { event.preventDefault(); const href = results[selectedResult].href; setQuery(""); setSearchOpen(false); if (pathname !== href) setNavigating(true); router.push(href); }
                }}
                placeholder="ค้นหาเมนู หมวดหมู่ หรือยุทโธปกรณ์..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              {query && <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="ล้างคำค้นหา"><X className="size-4" /></button>}

              {query.trim() && searchOpen && (
                <div className="absolute left-0 right-0 top-12 max-h-[min(65vh,30rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
                  {results.length ? (
                    results.map(({ id, label, description, href, Icon, kind }, index) => (
                      <Link
                        key={id}
                        href={href}
                        onClick={() => {
                          setQuery("");
                          setSearchOpen(false);
                          if (pathname !== href) {
                            setNavigating(true);
                          }
                        }}
                        onMouseEnter={() => setSelectedResult(index)}
                        className={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm active:bg-blue-100 last:border-b-0 ${index === selectedResult ? "bg-blue-50" : "hover:bg-blue-50"}`}
                      >
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                            kind === "equipment"
                              ? "bg-amber-100 text-amber-700"
                              : kind === "category"
                                ? "bg-cyan-100 text-cyan-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">{label}</span>
                          <span className="block truncate text-xs text-slate-500">{description}</span>
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="px-4 py-5 text-center text-sm text-slate-500">ไม่พบเมนูหรือยุทโธปกรณ์ที่ค้นหา</p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={refreshPage}
              disabled={isRefreshing}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-md hover:bg-sky-100 disabled:opacity-60"
              aria-label="รีเฟรชข้อมูล"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`size-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            <ThemeToggle />
          </div>
        </header>

        {children}
        <footer className="tems-mobile-footer-spacer" aria-hidden="true" />
        <UserAiAssistant />
      </div>
    </div>
  );
}
