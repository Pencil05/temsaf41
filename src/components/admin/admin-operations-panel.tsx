"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Clock3, Database, Download, FileText, HeartPulse, RefreshCw, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import type { AdminData } from "@/lib/admin-service";
import type { AdminOperationsData, ReportSchedule } from "@/lib/admin-operations-service";
import { CompactSelect } from "@/components/ui/compact-select";

type View = "approvals" | "anomalies" | "sheets" | "reports" | "count" | "undo";
type Props = { data: AdminData; operations: AdminOperationsData; notify: (message: string) => void };

const views: Array<{ id: View; label: string; icon: typeof ShieldCheck }> = [
  { id: "approvals", label: "งานรออนุมัติ", icon: ShieldCheck },
  { id: "anomalies", label: "ความผิดปกติ", icon: AlertTriangle },
  { id: "sheets", label: "Google Sheets", icon: HeartPulse },
  { id: "reports", label: "รายงาน", icon: FileText },
  { id: "count", label: "ตรวจนับคลัง", icon: ClipboardCheck },
  { id: "undo", label: "Undo Admin", icon: RotateCcw },
];

export function AdminOperationsPanel({ data, operations, notify }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("approvals");
  const [busy, setBusy] = useState("");

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(String(payload.id || payload.action || "working"));
    try {
      const response = await fetch("/api/admin/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ดำเนินการไม่สำเร็จ");
      notify(success);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  return <>
    <section className="mt-6 overflow-hidden rounded-[28px] border border-blue-200 bg-white shadow-lg">
      <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-5 sm:p-6">
        <p className="text-sm font-bold text-blue-600">ADMIN OPERATIONS CENTER</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-2xl font-bold">ศูนย์ปฏิบัติการและกำกับดูแล</h3><p className="mt-1 text-sm text-slate-500">ตรวจสอบ อนุมัติ รายงาน และย้อนกลับงานสำคัญจากจุดเดียว</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">ตรวจระบบล่าสุด {formatDate(operations.checkedAt)}</span></div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3 [scrollbar-width:none]">
        {views.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold transition active:scale-[.98] ${view === id ? "bg-blue-600 text-white shadow-md" : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}><Icon className="size-4" />{label}{id === "approvals" && operations.approvals.length > 0 && <span className={`rounded-full px-1.5 text-xs ${view === id ? "bg-white/20" : "bg-red-100 text-red-600"}`}>{operations.approvals.length}</span>}</button>)}
      </div>
      <div className="p-4 sm:p-6">
        {view === "approvals" && <ApprovalCenter operations={operations} busy={busy} decide={(item, decision) => mutate(item.type === "maintenance" ? { action: "approve-maintenance", id: item.referenceId, decision } : { action: "decide-count", id: item.id, decision }, decision === "approved" ? "อนุมัติรายการเรียบร้อยแล้ว" : "ปฏิเสธรายการเรียบร้อยแล้ว")} />}
        {view === "anomalies" && <AnomalyDashboard data={data} />}
        {view === "sheets" && <SheetsHealth operations={operations} refreshing={busy === "refresh"} onRefresh={() => { setBusy("refresh"); router.refresh(); window.setTimeout(() => setBusy(""), 900); }} />}
        {view === "reports" && <ReportCenter data={data} operations={operations} busy={busy} saveSchedule={(schedule) => mutate({ action: "save-report-schedule", ...schedule }, "บันทึกตารางส่งรายงาน LINE OA แล้ว")} />}
        {view === "count" && <InventoryCount data={data} history={operations.counts} busy={busy} submit={(items) => mutate({ action: "inventory-count", items }, "บันทึกผลตรวจนับแล้ว รายการที่มียอดต่างถูกส่งไปรออนุมัติ")} />}
        {view === "undo" && <UndoCenter operations={operations} busy={busy} undo={(id) => mutate({ action: "undo-admin", id }, "ย้อนกลับรายการเรียบร้อยแล้ว")} />}
      </div>
    </section>
  </>;
}

function ApprovalCenter({ operations, busy, decide }: { operations: AdminOperationsData; busy: string; decide: (item: AdminOperationsData["approvals"][number], decision: "approved" | "rejected") => void }) {
  if (!operations.approvals.length) return <Empty icon={CheckCircle2} title="ไม่มีงานรออนุมัติ" detail="รายการแจ้งซ่อมและผลตรวจนับที่มียอดต่างจะแสดงที่นี่" />;
  return <div className="grid gap-3 xl:grid-cols-2">{operations.approvals.map((item) => <article key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Clock3 className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{item.title}</h4><span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-amber-700">รออนุมัติ</span></div><p className="mt-1 text-sm text-slate-600">{item.companyName}</p><p className="mt-2 rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-600">{readableDetail(item.detail)}</p><p className="mt-2 text-xs text-slate-500">ผู้ส่งเรื่อง {item.requestedBy} · {formatDate(item.createdAt)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => decide(item, "rejected")} className="h-10 rounded-xl border border-red-200 bg-white font-bold text-red-600 disabled:opacity-50"><X className="mr-1 inline size-4" />{item.type === "maintenance" ? "ไม่รับเรื่อง" : "ไม่อนุมัติ"}</button><button type="button" disabled={Boolean(busy)} onClick={() => decide(item, "approved")} className="h-10 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-50"><Check className="mr-1 inline size-4" />{item.type === "maintenance" ? "รับเรื่องตรวจสอบ" : "อนุมัติปรับยอด"}</button></div></article>)}</div>;
}

function AnomalyDashboard({ data }: { data: AdminData }) {
  const anomalies = useMemo(() => {
    const items: Array<{ id: string; level: "critical" | "warning" | "info"; title: string; detail: string; company: string }> = [];
    data.inventories.forEach((item) => {
      if ([item.total, item.available, item.borrowed, item.broken].some((value) => value < 0)) items.push({ id: `negative:${item.id}`, level: "critical", title: "พบยอดติดลบ", detail: `${item.equipmentName} · รวม ${item.total} / พร้อมใช้ ${item.available} / ยืม ${item.borrowed} / ชำรุด ${item.broken}`, company: item.companyName });
      if (item.total !== item.available + item.borrowed + item.broken) items.push({ id: `balance:${item.id}`, level: "critical", title: "สมการยอดคลังไม่สมดุล", detail: `${item.equipmentName}: ยอดรวม ${item.total} แต่ผลรวมสถานะเท่ากับ ${item.available + item.borrowed + item.broken}`, company: item.companyName });
      if (item.requirePlate && item.total > 1) items.push({ id: `serial:${item.id}`, level: "warning", title: "รายการ Serial มีจำนวนมากกว่า 1", detail: `${item.equipmentName} · ${item.plateNumber || "ไม่ระบุ Serial"} · จำนวน ${item.total}`, company: item.companyName });
      if (item.requirePlate && !item.plateNumber) items.push({ id: `missing-serial:${item.id}`, level: "warning", title: "ไม่พบ Serial/ทะเบียน", detail: item.equipmentName, company: item.companyName });
    });
    data.transactions.filter((item) => item.activeBorrow && item.status.toLowerCase() === "overdue").forEach((item) => items.push({ id: `overdue:${item.id}`, level: "warning", title: "เกินกำหนดคืน", detail: `${item.equipmentName} จำนวน ${item.outstandingQuantity} · ผู้เบิก ${item.operator} · กำหนด ${formatDate(item.dueDate)}`, company: item.borrower }));
    data.users.filter((user) => !user.companyId || !user.email).forEach((user) => items.push({ id: `user:${user.id}`, level: "info", title: "ข้อมูลผู้ใช้ไม่ครบ", detail: `${user.rank} ${user.firstName} ${user.lastName} · ${!user.companyId ? "ไม่มีกองร้อย" : "ไม่มีอีเมลเข้าสู่ระบบ"}`, company: user.companyName }));
    return items;
  }, [data]);
  const counts = { critical: anomalies.filter((item) => item.level === "critical").length, warning: anomalies.filter((item) => item.level === "warning").length, info: anomalies.filter((item) => item.level === "info").length };
  return <><div className="grid gap-3 sm:grid-cols-3"><Metric label="ต้องแก้ไขทันที" value={counts.critical} tone="red" /><Metric label="ควรตรวจสอบ" value={counts.warning} tone="amber" /><Metric label="ข้อมูลไม่สมบูรณ์" value={counts.info} tone="blue" /></div><div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">{anomalies.length ? anomalies.map((item) => <article key={item.id} className={`rounded-xl border p-3 ${item.level === "critical" ? "border-red-200 bg-red-50" : item.level === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}><div className="flex items-start gap-3"><AlertTriangle className={`mt-0.5 size-5 shrink-0 ${item.level === "critical" ? "text-red-600" : item.level === "warning" ? "text-amber-600" : "text-blue-600"}`} /><div><h4 className="font-bold">{item.title}</h4><p className="mt-1 text-sm text-slate-600">{item.detail}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.company}</p></div></div></article>) : <Empty icon={CheckCircle2} title="ไม่พบความผิดปกติ" detail="ยอดคลัง รายการยืม และข้อมูลผู้ใช้ผ่านการตรวจสอบทั้งหมด" />}</div></>;
}

function SheetsHealth({ operations, refreshing, onRefresh }: { operations: AdminOperationsData; refreshing: boolean; onRefresh: () => void }) {
  const healthy = operations.sheetHealth.filter((item) => item.ok).length;
  return <><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-bold">สถานะการเชื่อมต่อฐานข้อมูล</h4><p className="text-sm text-slate-500">พร้อมใช้งาน {healthy}/{operations.sheetHealth.length} ชีต</p></div><button type="button" onClick={onRefresh} disabled={refreshing} className="flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 disabled:opacity-50"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />ตรวจสอบใหม่</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{operations.sheetHealth.map((item) => <article key={item.name} className={`rounded-2xl border p-4 ${item.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50"}`}><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}><Database className="size-5" /></span><div><h4 className="font-bold">{item.name}</h4><p className={`text-xs font-semibold ${item.ok ? "text-emerald-700" : "text-red-700"}`}>{item.message}</p></div></div><div className="mt-3 flex justify-between border-t border-current/10 pt-3 text-xs text-slate-500"><span>{item.rows.toLocaleString("th-TH")} แถว · {item.columns} คอลัมน์</span><span>{item.latencyMs} ms</span></div></article>)}</div></>;
}

function ReportCenter({ data, operations, busy, saveSchedule }: { data: AdminData; operations: AdminOperationsData; busy: string; saveSchedule: (schedule: Partial<ReportSchedule>) => void }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [frequency, setFrequency] = useState<ReportSchedule["frequency"]>("daily");
  const [downloading, setDownloading] = useState(false);
  const existing = operations.schedules.find((item) => item.frequency === frequency);
  const hour = "8";
  const [day, setDay] = useState(String(existing?.day ?? 1));
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const period = reportPeriod(frequency);
  const transactions = data.transactions.filter((item) => inRange(item.returnDate || item.date, period.start, period.end));
  const maintenance = data.maintenance.filter((item) => inRange(item.completedAt || item.date, period.start, period.end));
  const total = data.inventories.reduce((sum, item) => sum + item.total, 0);
  async function download() {
    setDownloading(true);
    try { const canvas = renderAdminReportCanvas(data, transactions, maintenance, frequency, period); const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const width = 186; const pageHeight = 277; const height = canvas.height * width / canvas.width; let offset = 10; const image = canvas.toDataURL("image/jpeg", .94); while (offset > -height) { pdf.addImage(image, "JPEG", 12, offset, width, height); offset -= pageHeight; if (offset > -height) pdf.addPage(); } pdf.save(`TEMS-${frequency}-${new Date().toISOString().slice(0, 10)}.pdf`); } finally { setDownloading(false); }
  }
  function chooseFrequency(value: string) { const next = value as ReportSchedule["frequency"]; const saved = operations.schedules.find((item) => item.frequency === next); setFrequency(next); setDay(String(saved?.day ?? 1)); setEnabled(saved?.enabled ?? false); }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]"><div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><CompactSelect value={frequency} onChange={chooseFrequency} className="w-full sm:w-56" options={[{ value: "daily", label: "รายงานประจำวัน" }, { value: "weekly", label: "รายงานประจำสัปดาห์" }, { value: "monthly", label: "รายงานประจำเดือน" }]} /><button type="button" onClick={download} disabled={downloading} className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-50"><Download className="size-4" />{downloading ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}</button></div><div ref={reportRef} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="border-b-2 border-blue-600 pb-4"><p className="text-xs font-bold tracking-[.2em] text-blue-600">TEMS OFFICIAL REPORT</p><h3 className="mt-2 text-2xl font-bold">รายงานสรุป{frequency === "daily" ? "ประจำวัน" : frequency === "weekly" ? "ประจำสัปดาห์" : "ประจำเดือน"}</h3><p className="mt-1 text-sm text-slate-500">ช่วงข้อมูล {formatDate(period.start.toISOString())} – {formatDate(period.end.toISOString())}</p></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><ReportMetric label="ยุทโธปกรณ์รวม" value={total} /><ReportMetric label="พร้อมใช้" value={data.inventories.reduce((sum, item) => sum + item.available, 0)} /><ReportMetric label="รายการเบิก/คืน" value={transactions.length} /><ReportMetric label="งานซ่อม" value={maintenance.length} /></div><ReportTable title="สรุปตามกองร้อย" rows={data.companies.map((company) => [company.name, company.total, company.available, company.borrowed, company.broken])} headers={["กองร้อย", "รวม", "พร้อมใช้", "ยืม", "ชำรุด"]} /><ReportTable title="ความเคลื่อนไหวในช่วงรายงาน" rows={transactions.slice(0, 30).map((item) => [item.equipmentName, item.quantity, `${item.owner} → ${item.borrower}`, statusThai(item.status)])} headers={["ยุทโธปกรณ์", "จำนวน", "เส้นทาง", "สถานะ"]} /><p className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-400">สร้างโดยระบบ TEMS เมื่อ {formatDate(new Date().toISOString())}</p></div></div><aside className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4"><div className="flex items-center gap-2"><Send className="size-5 text-blue-600" /><h4 className="font-bold">ส่งสรุปเข้า LINE OA</h4></div><p className="mt-1 text-sm leading-6 text-slate-500">บัญชี Vercel Hobby จะส่งข้อความสรุปวันละครั้ง เวลาประมาณ 08:05 น.</p><div className="mt-4 space-y-3"><div className="rounded-xl border border-slate-200 bg-white p-3"><span className="block text-sm font-semibold">เวลาส่งอัตโนมัติ</span><span className="mt-1 block text-lg font-bold text-blue-700">08:05 น.</span></div>{frequency !== "daily" && <label className="block"><span className="mb-1 block text-sm font-semibold">{frequency === "weekly" ? "วันในสัปดาห์" : "วันที่ของเดือน"}</span>{frequency === "weekly" ? <select value={day} onChange={(event) => setDay(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">{[[1,"จันทร์"],[2,"อังคาร"],[3,"พุธ"],[4,"พฤหัสบดี"],[5,"ศุกร์"],[6,"เสาร์"],[0,"อาทิตย์"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <input type="number" min={1} max={28} value={day} onChange={(event) => setDay(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />}</label>}<label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><span><span className="block text-sm font-bold">เปิดส่งอัตโนมัติ</span><span className="text-xs text-slate-500">{existing?.lastSentKey ? `ส่งล่าสุดรอบ ${existing.lastSentKey}` : "ยังไม่เคยส่ง"}</span></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-blue-600" /></label><button type="button" disabled={Boolean(busy)} onClick={() => saveSchedule({ frequency, hour: Number(hour), day: Number(day), enabled })} className="h-11 w-full rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50">บันทึกตารางส่ง</button></div></aside></div>;
}

function InventoryCount({ data, history, busy, submit }: { data: AdminData; history: AdminOperationsData["counts"]; busy: string; submit: (items: Array<{ inventoryId: string; actual: number }>) => void }) {
  const [companyId, setCompanyId] = useState(data.companies[0]?.id || "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actual, setActual] = useState<Record<string, string>>({});
  const items = data.inventories.filter((item) => item.companyId === companyId && (!query || `${item.equipmentName} ${item.plateNumber}`.toLowerCase().includes(query.toLowerCase())) && (!item.assetOwnerCompanyId || item.assetOwnerCompanyId === item.companyId));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <><div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)_auto]"><CompactSelect value={companyId} onChange={(value) => { setCompanyId(value); setSelected(new Set()); }} searchable options={data.companies.map((company) => ({ value: company.id, label: company.name }))} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือ Serial..." className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500" /><button type="button" disabled={!selected.size || Boolean(busy)} onClick={() => submit([...selected].map((inventoryId) => ({ inventoryId, actual: Number(actual[inventoryId] ?? data.inventories.find((item) => item.id === inventoryId)?.available ?? 0) })))} className="h-11 rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-40">บันทึกตรวจนับ {selected.size || ""}</button></div><div className="mt-4 max-h-[480px] overflow-y-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[700px] text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-500"><tr><th className="px-3 py-3">เลือก</th><th className="px-3 py-3">ยุทโธปกรณ์</th><th className="px-3 py-3">Serial/ทะเบียน</th><th className="px-3 py-3">ยอดในระบบ</th><th className="px-3 py-3">ยอดนับจริง</th><th className="px-3 py-3">ส่วนต่าง</th></tr></thead><tbody>{items.map((item) => { const value = Number(actual[item.id] ?? item.available); const difference = value - item.available; return <tr key={item.id} onClick={() => toggle(item.id)} className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50 ${selected.has(item.id) ? "bg-blue-50" : ""}`}><td className="px-3 py-2"><input type="checkbox" readOnly checked={selected.has(item.id)} className="size-4 accent-blue-600" /></td><td className="px-3 py-2 font-bold">{item.equipmentName}</td><td className="px-3 py-2 text-slate-500">{item.plateNumber || "-"}</td><td className="px-3 py-2">{item.available.toLocaleString("th-TH")}</td><td className="px-3 py-2" onClick={(event) => event.stopPropagation()}><input type="number" min={0} value={actual[item.id] ?? String(item.available)} onFocus={() => { if (!selected.has(item.id)) toggle(item.id); }} onChange={(event) => setActual((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 w-28 rounded-lg border border-slate-200 px-2" /></td><td className={`px-3 py-2 font-bold ${difference === 0 ? "text-emerald-600" : difference > 0 ? "text-blue-600" : "text-red-600"}`}>{difference > 0 ? "+" : ""}{difference}</td></tr>; })}</tbody></table></div><div className="mt-6"><h4 className="font-bold">ประวัติตรวจนับล่าสุด</h4><div className="mt-3 grid gap-2 md:grid-cols-2">{history.slice(0, 8).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="truncate font-bold">{item.equipmentName}</p><span className={`shrink-0 text-xs font-bold ${item.difference ? "text-amber-700" : "text-emerald-700"}`}>{countStatus(item.status)}</span></div><p className="mt-1 text-xs text-slate-500">{item.companyName} · ระบบ {item.expected} / จริง {item.actual} / ต่าง {item.difference > 0 ? "+" : ""}{item.difference}</p></div>)}</div></div></>;
}

function UndoCenter({ operations, busy, undo }: { operations: AdminOperationsData; busy: string; undo: (id: string) => void }) {
  if (!operations.undo.length) return <Empty icon={Clock3} title="ไม่มีรายการที่ Undo ได้" detail="งาน Admin ใหม่จะย้อนกลับได้ภายใน 1 ชั่วโมง หากข้อมูลยังไม่ถูกแก้ไขต่อ" />;
  return <div className="space-y-3">{operations.undo.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><RotateCcw className="size-5" /></span><div className="min-w-0 flex-1"><h4 className="font-bold">{adminAction(item.action)}</h4><p className="truncate text-sm text-slate-600">เป้าหมาย {item.target} · โดย {item.actor}</p><p className="mt-1 text-xs text-violet-700">เหลือเวลา {remaining(item.expiresAt)}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("ยืนยันย้อนกลับรายการนี้? ระบบจะตรวจสอบก่อนว่าข้อมูลยังไม่ถูกแก้ไขต่อ")) undo(item.id); }} className="h-10 rounded-xl bg-violet-600 px-4 font-bold text-white disabled:opacity-50"><RotateCcw className="mr-2 inline size-4" />Undo</button></article>)}</div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "blue" }) { const styles = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700"; return <div className={`rounded-2xl border p-4 ${styles}`}><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-3xl font-black">{value.toLocaleString("th-TH")}</p></div>; }
function ReportMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-slate-100 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-blue-700">{value.toLocaleString("th-TH")}</p></div>; }
function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) { return <section className="mt-6"><h4 className="mb-2 font-bold">{title}</h4><table className="w-full table-fixed text-xs"><thead className="bg-blue-50 text-left text-blue-800"><tr>{headers.map((header) => <th key={header} className="px-2 py-2">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-b border-slate-100">{row.map((value, cell) => <td key={cell} className="break-words px-2 py-2">{typeof value === "number" ? value.toLocaleString("th-TH") : value}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-4 text-center text-slate-400">ไม่มีข้อมูลในช่วงนี้</td></tr>}</tbody></table></section>; }
function Empty({ icon: Icon, title, detail }: { icon: typeof CheckCircle2; title: string; detail: string }) { return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm"><Icon className="size-7" /></span><h4 className="mt-4 text-lg font-bold">{title}</h4><p className="mt-1 text-sm text-slate-500">{detail}</p></div></div>; }

function readableDetail(value: string) { try { const parsed = JSON.parse(value) as Record<string, unknown>; return `ยอดระบบ ${parsed.expected ?? "-"} · ยอดจริง ${parsed.actual ?? "-"} · ส่วนต่าง ${Number(parsed.difference) > 0 ? "+" : ""}${parsed.difference ?? "-"}`; } catch { return value || "ไม่มีรายละเอียด"; } }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value || "-" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function inRange(value: string, start: Date, end: Date) { const time = Date.parse(value); return !Number.isNaN(time) && time >= start.getTime() && time <= end.getTime(); }
function reportPeriod(frequency: ReportSchedule["frequency"]) { const end = new Date(); const start = new Date(end); if (frequency === "daily") start.setHours(0, 0, 0, 0); else if (frequency === "weekly") { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); } else { start.setDate(1); start.setHours(0, 0, 0, 0); } return { start, end }; }
function statusThai(status: string) { return ({ borrowed: "กำลังยืม", returned: "คืนแล้ว", overdue: "เกินกำหนด", defective: "ชำรุด" } as Record<string, string>)[status.toLowerCase()] || status; }
function countStatus(status: string) { return ({ verified: "ยอดตรง", pending: "รออนุมัติ", adjusted: "ปรับยอดแล้ว", rejected: "ไม่อนุมัติ" } as Record<string, string>)[status.toLowerCase()] || status; }
function remaining(expiresAt: string) { const milliseconds = Math.max(0, Date.parse(expiresAt) - Date.now()); return `${Math.floor(milliseconds / 60000)} นาที`; }
function adminAction(action: string) { return ({ "save-company": "แก้ไขกองร้อย", "delete-company": "ลบกองร้อย", "save-user": "แก้ไขผู้ใช้", "delete-user": "ลบผู้ใช้", "save-equipment": "แก้ไขยุทโธปกรณ์", "save-category": "แก้ไขหมวดหมู่", "save-inventory": "แก้ไขคลัง", "add-inventory": "เพิ่มรายการเข้าคลัง", "batch-add-inventory": "เพิ่มหลายรายการเข้าคลัง", "batch-adjust-inventory": "ปรับหลายรายการในคลัง", "transfer-inventory": "เคลื่อนย้ายยุทโธปกรณ์", "return-transaction": "คืนยุทโธปกรณ์", "maintenance-status": "เปลี่ยนสถานะซ่อม" } as Record<string, string>)[action] || action; }

function renderAdminReportCanvas(data: AdminData, transactions: AdminData["transactions"], maintenance: AdminData["maintenance"], frequency: ReportSchedule["frequency"], period: { start: Date; end: Date }) {
  const rowHeight = 42;
  const height = Math.max(1754, 690 + data.companies.length * rowHeight + Math.min(transactions.length, 30) * rowHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถสร้างรายงาน PDF ได้");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value: string, x: number, y: number, font = "400 22px Kanit, sans-serif", color = "#334155") => { context.font = font; context.fillStyle = color; context.fillText(value, x, y); };
  const line = (y: number, color = "#dbeafe") => { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.moveTo(70, y); context.lineTo(1170, y); context.stroke(); };
  const reportLabel = frequency === "daily" ? "ประจำวัน" : frequency === "weekly" ? "ประจำสัปดาห์" : "ประจำเดือน";
  text("TEMS • TACTICAL EQUIPMENT MANAGEMENT SYSTEM", 70, 75, "700 20px Kanit, sans-serif", "#2563eb");
  text(`รายงานสรุป${reportLabel}`, 70, 130, "700 42px Kanit, sans-serif", "#0f172a");
  text(`ช่วงข้อมูล ${formatDate(period.start.toISOString())} – ${formatDate(period.end.toISOString())}`, 70, 172, "400 20px Kanit, sans-serif", "#64748b");
  line(205, "#2563eb");
  const metrics = [
    ["ยุทโธปกรณ์รวม", data.inventories.reduce((sum, item) => sum + item.total, 0)],
    ["พร้อมใช้", data.inventories.reduce((sum, item) => sum + item.available, 0)],
    ["รายการเบิก/คืน", transactions.length],
    ["งานซ่อม", maintenance.length],
  ] as const;
  metrics.forEach(([label, value], index) => { const x = 70 + index * 275; context.fillStyle = "#eff6ff"; context.fillRect(x, 235, 245, 105); text(label, x + 18, 270, "500 18px Kanit, sans-serif", "#64748b"); text(value.toLocaleString("th-TH"), x + 18, 318, "700 34px Kanit, sans-serif", "#1d4ed8"); });
  let y = 400;
  text("สรุปตามกองร้อย", 70, y, "700 28px Kanit, sans-serif", "#0f172a");
  y += 34;
  context.fillStyle = "#dbeafe"; context.fillRect(70, y, 1100, rowHeight);
  [["กองร้อย", 90], ["รวม", 720], ["พร้อมใช้", 840], ["ยืม", 970], ["ชำรุด", 1070]].forEach(([label, x]) => text(String(label), Number(x), y + 28, "700 18px Kanit, sans-serif", "#1e3a8a"));
  y += rowHeight;
  data.companies.forEach((company, index) => { if (index % 2) { context.fillStyle = "#f8fafc"; context.fillRect(70, y, 1100, rowHeight); } text(company.name, 90, y + 28, "500 18px Kanit, sans-serif", "#0f172a"); text(String(company.total), 720, y + 28); text(String(company.available), 840, y + 28); text(String(company.borrowed), 970, y + 28); text(String(company.broken), 1070, y + 28); y += rowHeight; });
  y += 55;
  text("ความเคลื่อนไหวในช่วงรายงาน", 70, y, "700 28px Kanit, sans-serif", "#0f172a");
  y += 34;
  context.fillStyle = "#dbeafe"; context.fillRect(70, y, 1100, rowHeight);
  [["ยุทโธปกรณ์", 90], ["จำนวน", 610], ["ต้นทาง → ปลายทาง", 730], ["สถานะ", 1050]].forEach(([label, x]) => text(String(label), Number(x), y + 28, "700 18px Kanit, sans-serif", "#1e3a8a"));
  y += rowHeight;
  transactions.slice(0, 30).forEach((item, index) => { if (index % 2) { context.fillStyle = "#f8fafc"; context.fillRect(70, y, 1100, rowHeight); } text(item.equipmentName.slice(0, 36), 90, y + 28, "500 17px Kanit, sans-serif", "#0f172a"); text(String(item.quantity), 610, y + 28); text(`${item.owner} → ${item.borrower}`.slice(0, 34), 730, y + 28, "400 16px Kanit, sans-serif"); text(statusThai(item.status), 1050, y + 28, "500 16px Kanit, sans-serif", "#1d4ed8"); y += rowHeight; });
  if (!transactions.length) text("ไม่มีความเคลื่อนไหวในช่วงรายงาน", 90, y + 30, "400 18px Kanit, sans-serif", "#94a3b8");
  text(`สร้างโดยระบบ TEMS เมื่อ ${formatDate(new Date().toISOString())}`, 70, canvas.height - 55, "400 16px Kanit, sans-serif", "#94a3b8");
  return canvas;
}
