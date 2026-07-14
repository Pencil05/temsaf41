"use client";

import {
  Activity,
  ArrowRightLeft,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  Download,
  FileImage,
  FileText,
  Filter,
  Eye,
  LogOut,
  Menu,
  PackagePlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Fragment, useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { receiptCanvas } from "@/lib/client-media";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";
import type { AdminData, AdminMaintenance, AdminTransaction } from "@/lib/admin-service";

type Tab = "overview" | "users" | "equipment" | "inventory" | "transactions" | "maintenance" | "logs";
type Modal = { type: "company" | "user" | "equipment" | "inventory" | "transfer"; item?: Record<string, unknown> } | null;

const tabs: Array<{ id: Tab; label: string; Icon: typeof Boxes }> = [
  { id: "overview", label: "ภาพรวม", Icon: Boxes },
  { id: "users", label: "ผู้ใช้งาน", Icon: Users },
  { id: "equipment", label: "บัญชียุทโธปกรณ์", Icon: ClipboardList },
  { id: "inventory", label: "คลังทั้งหมด", Icon: Database },
  { id: "transactions", label: "ประวัติเบิก / คืน", Icon: Activity },
  { id: "maintenance", label: "ซ่อมบำรุง", Icon: Wrench },
  { id: "logs", label: "Audit Log", Icon: ShieldCheck },
];

export function AdminConsole({ initialData, adminName }: { initialData: AdminData; adminName: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [inventoryCompany, setInventoryCompany] = useState("");
  const [transactionCompany, setTransactionCompany] = useState("");
  const [maintenanceCompany, setMaintenanceCompany] = useState("");
  const [logCompany, setLogCompany] = useState("");
  const [maintenanceView, setMaintenanceView] = useState<"active" | "history">("active");
  const [companyDetail, setCompanyDetail] = useState("");
  const [receipt, setReceipt] = useState<AdminTransaction | null>(null);
  const [maintenanceReceipt, setMaintenanceReceipt] = useState<AdminMaintenance | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const keyword = query.trim().toLowerCase();
  const match = useCallback((...values: unknown[]) => !keyword || values.join(" ").toLowerCase().includes(keyword), [keyword]);
  usePopupDismiss(Boolean(companyDetail), () => setCompanyDetail(""));

  const filtered = useMemo(() => ({
    users: initialData.users.filter((item) => match(item.firstName, item.lastName, item.email, item.rank, item.companyName)),
    inventories: initialData.inventories.filter((item) => (!inventoryCompany || item.companyId === inventoryCompany) && match(item.equipmentName, item.category, item.companyName, item.plateNumber)),
    transactions: initialData.transactions.filter((item) => (!transactionCompany || item.ownerCompanyId === transactionCompany || item.borrowerCompanyId === transactionCompany) && match(item.id, item.equipmentName, item.owner, item.borrower, item.operator, item.status)),
    maintenance: initialData.maintenance.filter((item) => (!maintenanceCompany || item.companyId === maintenanceCompany) && (maintenanceView === "history" ? item.status.toLowerCase() === "completed" : item.status.toLowerCase() !== "completed") && match(item.equipmentName, item.companyName, item.operator, item.status, item.note)),
    logs: initialData.logs.filter((item) => (!logCompany || item.companyIds.includes(logCompany)) && match(item.user, item.action, item.target, item.details)),
  }), [initialData, inventoryCompany, logCompany, maintenanceCompany, maintenanceView, match, transactionCompany]);

  async function mutate(payload: Record<string, unknown>) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "บันทึกไม่สำเร็จ");
        return;
      }
      setModal(null);
      setMessage("บันทึกข้อมูลและ Audit Log เรียบร้อยแล้ว");
      startRefresh(() => router.refresh());
    } catch {
      setMessage("ไม่สามารถเชื่อมต่อระบบส่วนกลางได้");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  function openInventoryForCompany(companyId: string) {
    setCompanyDetail("");
    setInventoryCompany(companyId);
    setTab("inventory");
  }

  const navigation = (
    <>
      <div className="border-b border-slate-200 p-5">
        <p className="text-xs font-bold tracking-[.2em] text-blue-600">TEMS COMMAND</p>
        <h1 className="mt-1 text-xl font-bold">Admin Console</h1>
        <p className="mt-2 text-xs text-slate-500">{adminName}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => { setTab(id); setMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${tab === id ? "linear-dark-primary bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 active:bg-blue-50"}`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </nav>
      <button type="button" onClick={logout} className="logout-button m-3 flex items-center gap-3 rounded-xl bg-red-50 p-3 font-bold text-red-700 transition hover:bg-red-100 active:scale-[0.98]"><LogOut className="size-5" />ออกจากระบบ</button>
    </>
  );

  return (
    <div className="admin-shell min-h-screen bg-slate-50 text-slate-900">
      {(saving || refreshing) && <ActionLoadingOverlay message={saving ? "กำลังบันทึกและสร้าง Audit Log..." : "กำลังโหลดข้อมูลล่าสุด..."} />}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex">{navigation}</aside>
      {menu && <div className="fixed inset-0 z-50 bg-slate-950/45 lg:hidden" onClick={() => setMenu(false)}><aside className="popup-panel flex h-full w-[84%] max-w-xs flex-col bg-white" onClick={(event) => event.stopPropagation()}>{navigation}</aside></div>}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl">
          <button type="button" onClick={() => setMenu(true)} className="grid size-10 place-items-center rounded-xl border border-slate-300 lg:hidden"><Menu className="size-5" /></button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาผู้ใช้ กองร้อย ยุทโธปกรณ์ ธุรกรรม หรือ Log..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
          </div>
          <button type="button" onClick={() => startRefresh(() => router.refresh())} className="grid size-10 place-items-center rounded-xl border border-slate-200"><RefreshCw className="size-4" /></button>
          <ThemeToggle />
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-semibold text-blue-600">ศูนย์ควบคุมส่วนกลาง</p><h2 className="text-2xl font-bold">{tabs.find((item) => item.id === tab)?.label}</h2></div>
            {message && <button type="button" onClick={() => setMessage("")} className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-700">{message}</button>}
          </div>

          {tab === "overview" && <CompanyGrid data={initialData} onSelect={setCompanyDetail} onAdd={() => setModal({ type: "company" })} />}
          {tab === "overview" && <Overview data={initialData} />}
          {tab === "users" && <Section title="ผู้ใช้ทั้งหมด" action="เพิ่มผู้ใช้" onAdd={() => setModal({ type: "user" })}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.users.map((item) => <Card key={item.id} onClick={() => setModal({ type: "user", item: item as unknown as Record<string, unknown> })} title={`${item.rank} ${item.firstName} ${item.lastName}`} detail={`${item.role} · ${item.companyName}`} meta={`${item.email} · ${item.phone || "ไม่มีเบอร์"}`} />)}</div></Section>}
          {tab === "equipment" && <Section title="บัญชียุทโธปกรณ์แม่" action="เพิ่มชนิดยุทโธปกรณ์" onAdd={() => setModal({ type: "equipment" })}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{initialData.equipments.filter((item) => match(item.name, item.category)).map((item) => <Card key={item.id} onClick={() => setModal({ type: "equipment", item: item as unknown as Record<string, unknown> })} title={item.name} detail={item.category} meta={item.requirePlate ? "แยกรายคัน/ทะเบียน" : "นับตามจำนวน"} />)}</div></Section>}

          {tab === "inventory" && (
            <Section title={inventoryCompany ? `คลัง ${initialData.companies.find((item) => item.id === inventoryCompany)?.name}` : "คลังทุกกองร้อย"} action="เพิ่มรายการเข้าคลัง" onAdd={() => setModal({ type: "inventory", item: { companyId: inventoryCompany } })}>
              <Toolbar>
                <CompanyFilter value={inventoryCompany} onChange={setInventoryCompany} companies={initialData.companies} />
                <button type="button" onClick={() => setModal({ type: "transfer" })} className="flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"><ArrowRightLeft className="size-4" />เคลื่อนย้ายยุทโธปกรณ์</button>
              </Toolbar>
              <InventoryTable items={filtered.inventories} groupByCompany={!inventoryCompany} onEdit={(item) => setModal({ type: "inventory", item: item as unknown as Record<string, unknown> })} />
            </Section>
          )}

          {tab === "transactions" && (
            <Section title="ประวัติการเบิกและคืนทั้งหมด">
              <Toolbar><CompanyFilter value={transactionCompany} onChange={setTransactionCompany} companies={initialData.companies} /></Toolbar>
              <AdminTransactionTable items={filtered.transactions} onSelect={setReceipt} />
            </Section>
          )}

          {tab === "maintenance" && (
            <Section title={maintenanceView === "active" ? "รายการซ่อมบำรุงปัจจุบัน" : "ประวัติการส่งซ่อม"}>
              <Toolbar>
                <CompanyFilter value={maintenanceCompany} onChange={setMaintenanceCompany} companies={initialData.companies} />
                <div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setMaintenanceView("active")} className={`rounded-lg px-3 py-2 text-sm font-bold ${maintenanceView === "active" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>กำลังซ่อม</button><button type="button" onClick={() => setMaintenanceView("history")} className={`rounded-lg px-3 py-2 text-sm font-bold ${maintenanceView === "history" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>ประวัติซ่อมเสร็จ</button></div>
              </Toolbar>
              <GroupedCards items={filtered.maintenance} companies={initialData.companies} getCompanyId={(item) => item.companyId} getKey={(item) => item.id} render={(item) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex items-center gap-2"><h3 className="font-bold">{item.equipmentName}</h3>{item.status.toLowerCase() === "completed" && <CheckCircle2 className="size-5 text-emerald-600" />}</div><p className="text-sm text-slate-500">{item.companyName} · {item.operator} · {item.quantity.toLocaleString("th-TH")} รายการ</p><p className="mt-1 text-sm">{item.note || "ไม่มีหมายเหตุ"}</p><p className="mt-2 text-xs text-slate-400">แจ้งเมื่อ {format(item.date)}{item.completedAt ? ` · ซ่อมเสร็จ ${format(item.completedAt)}` : ""}</p><button type="button" onClick={() => setMaintenanceReceipt(item)} className="mt-3 text-sm font-bold text-blue-600">ดูใบเสร็จแจ้งซ่อม</button></div>{maintenanceView === "active" && <select value={item.status} onChange={(event) => mutate({ action: "maintenance-status", id: item.id, status: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3"><option value="Reported">รับแจ้ง</option><option value="Inspecting">กำลังตรวจสอบ</option><option value="Repairing">กำลังซ่อม</option><option value="Completed">ซ่อมเสร็จ</option></select>}</div></div>} />
              {!filtered.maintenance.length && <Empty text={maintenanceView === "active" ? "ไม่มีรายการที่กำลังซ่อม" : "ยังไม่มีประวัติซ่อมเสร็จ"} />}
            </Section>
          )}

          {tab === "logs" && (
            <Section title="บันทึกการเปลี่ยนแปลงทั้งหมด">
              <Toolbar><CompanyFilter value={logCompany} onChange={setLogCompany} companies={initialData.companies} /></Toolbar>
              <GroupedCards items={filtered.logs} companies={initialData.companies} getCompanyId={(item) => item.companyIds[0] || ""} getKey={(item) => item.id} render={(item) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-blue-700">{item.action}</h3><span className="text-xs text-slate-400">{format(item.timestamp)}</span></div><p className="mt-1 text-sm text-slate-600">ผู้ดำเนินการ: {item.user}</p><p className="mt-1 break-words text-sm text-slate-500">เป้าหมาย {item.target}{item.details ? ` · ${item.details}` : ""}</p></div>} />
              {!filtered.logs.length && <Empty text="ไม่พบ Audit Log ตามตัวกรอง" />}
            </Section>
          )}
        </main>
      </div>

      {companyDetail && <CompanyDetail data={initialData} companyId={companyDetail} onClose={() => setCompanyDetail("")} onOpenInventory={openInventoryForCompany} />}
      {receipt && <AdminReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />}
      {maintenanceReceipt && <AdminMaintenanceReceiptModal maintenance={maintenanceReceipt} onClose={() => setMaintenanceReceipt(null)} />}
      {modal && <EditModal modal={modal} data={initialData} onClose={() => setModal(null)} onSave={mutate} />}
    </div>
  );
}

function Overview({ data }: { data: AdminData }) {
  const metrics = [
    { label: "ยุทโธปกรณ์รวม", value: data.companies.reduce((sum, item) => sum + item.total, 0), Icon: Boxes },
    { label: "ผู้ใช้งาน", value: data.users.length, Icon: Users },
    { label: "กำลังยืม", value: data.transactions.filter((item) => item.status.toLowerCase() === "borrowed").length, Icon: Activity },
    { label: "กำลังซ่อม", value: data.maintenance.filter((item) => item.status.toLowerCase() !== "completed").length, Icon: Wrench },
  ];
  return <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(({ label, value, Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md"><Icon className="size-5 text-blue-600" /><p className="mt-5 text-sm text-slate-500">{label}</p><p className="text-3xl font-bold">{value.toLocaleString("th-TH")}</p></div>)}</section>;
}

function CompanyGrid({ data, onSelect, onAdd }: { data: AdminData; onSelect: (id: string) => void; onAdd: () => void }) {
  return <Section title="ทุกกองร้อย" action="เพิ่มกองร้อย" onAdd={onAdd}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.companies.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-md transition hover:-translate-y-1 hover:border-blue-400 active:scale-[0.99]"><div className="flex justify-between"><Building2 className="size-6 text-blue-600" /><span className="text-xs text-slate-500">{item.users} ผู้ใช้</span></div><h3 className="mt-4 text-lg font-bold">{item.name}</h3><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><Stat number={item.total} label="รวม" /><Stat number={item.available} label="พร้อม" /><Stat number={item.borrowed} label="ยืม" /><Stat number={item.broken} label="เสีย" /></div><p className="mt-4 text-xs font-semibold text-blue-600">ดูรายละเอียดคลังและหมวดหมู่ →</p></button>)}</div></Section>;
}

function CompanyDetail({ data, companyId, onClose, onOpenInventory }: { data: AdminData; companyId: string; onClose: () => void; onOpenInventory: (id: string) => void }) {
  const company = data.companies.find((item) => item.id === companyId);
  const stock = data.inventories.filter((item) => item.companyId === companyId);
  const categories = [...stock.reduce((groups, item) => {
    const current = groups.get(item.category) || { total: 0, available: 0, broken: 0, items: 0 };
    current.total += item.total; current.available += item.available; current.broken += item.broken; current.items += 1;
    groups.set(item.category, current);
    return groups;
  }, new Map<string, { total: number; available: number; broken: number; items: number }>()).entries()];
  return <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-[30px] bg-slate-50 p-5 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">รายละเอียดกองร้อย</p><h2 className="text-2xl font-bold">{company?.name}</h2><p className="mt-1 text-sm text-slate-500">แสดงยอดจริง แยกหมวดหมู่และรายการย่อยในคลัง</p></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-white shadow"><X className="size-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="รวมทั้งหมด" value={company?.total || 0} tone="text-blue-700" /><Summary label="พร้อมใช้" value={company?.available || 0} tone="text-emerald-700" /><Summary label="ถูกยืม" value={company?.borrowed || 0} tone="text-amber-700" /><Summary label="ชำรุด" value={company?.broken || 0} tone="text-red-700" /></div><h3 className="mt-7 font-bold">สรุปตามหมวดหมู่</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map(([name, value]) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="font-bold text-blue-700">{name}</p><p className="mt-3 text-2xl font-bold">{value.total.toLocaleString("th-TH")}</p><p className="text-xs text-slate-500">{value.items} รายการย่อย · พร้อม {value.available.toLocaleString("th-TH")} · เสีย {value.broken.toLocaleString("th-TH")}</p></div>)}</div><h3 className="mt-7 font-bold">รายการยุทโธปกรณ์ในคลัง</h3><InventoryTable items={stock} /><button type="button" onClick={() => onOpenInventory(companyId)} className="mt-5 h-12 w-full rounded-full bg-blue-600 font-bold text-white">เปิดหน้าจัดการคลังกองร้อยนี้</button></div></div>;
}

function AdminReceiptModal({ transaction, onClose }: { transaction: AdminTransaction; onClose: () => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloads, setDownloads] = useState(false);
  const [processing, setProcessing] = useState(false);
  const returned = transaction.status.toLowerCase() === "returned";
  usePopupDismiss(!downloads, onClose);
  usePopupDismiss(downloads, () => setDownloads(false));
  async function download(type: "jpg" | "pdf") {
    if (!receiptRef.current) return;
    setProcessing(true);
    try {
      const canvas = await receiptCanvas(receiptRef.current);
      if (type === "jpg") {
        const link = document.createElement("a"); link.download = `${transaction.id}.jpg`; link.href = canvas.toDataURL("image/jpeg", 0.95); link.click();
      } else {
        const { jsPDF } = await import("jspdf"); const document = new jsPDF(); const width = 186; document.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, canvas.height * width / canvas.width); document.save(`${transaction.id}.pdf`);
      }
      setDownloads(false);
    } finally { setProcessing(false); }
  }
  return <>{processing && <ActionLoadingOverlay message="กำลังสร้างไฟล์ใบเสร็จ..." />}<div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]"><div ref={receiptRef}><ReceiptDocument title={returned ? "รายละเอียดการคืนยุทโธปกรณ์" : "รายละเอียดการเบิกยุทโธปกรณ์"} referenceId={transaction.id} status={transaction.status} date={returned ? transaction.returnDate || transaction.date : transaction.date} operatorName={transaction.operator} contactPhone={transaction.operatorPhone} contactEmail={transaction.operatorEmail} ownerCompanyName={transaction.owner} borrowerCompanyName={transaction.borrower} dueDate={!returned ? transaction.dueDate : undefined} note={transaction.note} evidenceImage={transaction.evidenceImage} items={[{ name: transaction.equipmentName, quantity: transaction.quantity, plateNumber: transaction.plateNumber || undefined }]} /></div><div className="mt-4 flex gap-3"><button type="button" onClick={onClose} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button><button type="button" onClick={() => setDownloads(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white"><Download className="size-5" /></button></div></div></div>{downloads && <div className="popup-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setDownloads(false); }}><div className="popup-panel w-full max-w-xs rounded-[24px] bg-white p-5"><div className="flex justify-between"><h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3><button type="button" onClick={() => setDownloads(false)}><X className="size-5" /></button></div><div className="mt-4 space-y-3"><button type="button" onClick={() => download("jpg")} className="flex w-full items-center gap-3 rounded-xl bg-blue-50 p-4 font-semibold text-blue-700"><FileImage className="size-5" />ไฟล์รูป JPG</button><button type="button" onClick={() => download("pdf")} className="flex w-full items-center gap-3 rounded-xl bg-red-50 p-4 font-semibold text-red-700"><FileText className="size-5" />ไฟล์ PDF</button></div></div></div>}</>;
}

function AdminMaintenanceReceiptModal({ maintenance, onClose }: { maintenance: AdminMaintenance; onClose: () => void }) {
  usePopupDismiss(true, onClose);
  return <div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]"><ReceiptDocument title="รายละเอียดการแจ้งยุทโธปกรณ์ชำรุด" referenceId={maintenance.id} status={maintenance.status} date={maintenance.date} operatorName={maintenance.operator} contactPhone={maintenance.operatorPhone} contactEmail={maintenance.operatorEmail} ownerCompanyName={maintenance.companyName} borrowerCompanyName={maintenance.companyName} note={maintenance.note} evidenceImage={maintenance.evidenceImage} items={[{ name: maintenance.equipmentName, quantity: maintenance.quantity }]} /><button type="button" onClick={onClose} className="mt-4 h-12 w-full rounded-full bg-white font-bold text-slate-600">ปิด</button></div></div>;
}

function InventoryTable({ items, onEdit, groupByCompany = false }: { items: AdminData["inventories"]; onEdit?: (item: AdminData["inventories"][number]) => void; groupByCompany?: boolean }) {
  const ordered = [...items].sort((first, second) => `${first.companyName} ${first.category} ${first.equipmentName}`.localeCompare(`${second.companyName} ${second.category} ${second.equipmentName}`, "th"));
  return <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50"><tr>{["ยุทโธปกรณ์", "หมวดหมู่", "กองร้อย", "ทะเบียน", "รวม", "พร้อม", "ยืม", "เสีย"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{ordered.map((item, index) => <Fragment key={item.id}>{groupByCompany && item.companyName !== ordered[index - 1]?.companyName && <tr><td colSpan={8} className="border-t border-blue-200 bg-blue-50 px-4 py-3 font-bold text-blue-800"><span className="inline-flex items-center gap-2"><Building2 className="size-4" />{item.companyName}</span></td></tr>}<tr onClick={() => onEdit?.(item)} className={`border-t border-slate-100 ${onEdit ? "cursor-pointer hover:bg-blue-50" : ""}`}><td className="p-3 font-semibold">{item.equipmentName}</td><td>{item.category}</td><td>{item.companyName}</td><td>{item.plateNumber || "-"}</td><td>{item.total}</td><td className="text-emerald-600">{item.available}</td><td className="text-amber-600">{item.borrowed}</td><td className="text-red-600">{item.broken}</td></tr></Fragment>)}</tbody></table>{!items.length && <Empty text="ไม่พบรายการในคลัง" />}</div>;
}

function AdminTransactionTable({ items, onSelect }: { items: AdminTransaction[]; onSelect: (item: AdminTransaction) => void }) {
  const groups = useMemo(() => {
    const result = new Map<string, AdminTransaction[]>();
    [...items].sort((first, second) => new Date(second.returnDate || second.date).getTime() - new Date(first.returnDate || first.date).getTime()).forEach((item) => {
      const date = new Date(item.returnDate || item.date);
      const key = Number.isNaN(date.getTime()) ? "unknown" : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const records = result.get(key) || [];
      records.push(item);
      result.set(key, records);
    });
    return [...result.entries()];
  }, [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{groups.map(([key, records]) => {
    const hidden = collapsed.has(key);
    const date = records[0]?.returnDate || records[0]?.date;
    return <div key={key} className="border-b border-slate-200 last:border-b-0"><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"><ChevronDown className={`size-4 transition-transform ${hidden ? "-rotate-90" : ""}`} /><span className="font-semibold">{key === "unknown" ? "ไม่ระบุวันที่" : new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date(date))}</span><span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">{records.length} รายการ</span></button>{!hidden && <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="border-y border-slate-200 text-left text-xs text-slate-500"><tr>{["สถานะ", "ยุทโธปกรณ์", "จำนวน", "ต้นทาง", "ปลายทาง", "ผู้ดำเนินการ", "เวลา", ""].map((label) => <th key={label} className="px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{records.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status.toLowerCase() === "returned" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status}</span></td><td className="max-w-[220px] truncate px-4 py-2.5 font-semibold">{item.equipmentName}</td><td className="px-4 py-2.5">{item.quantity.toLocaleString("th-TH")}</td><td className="max-w-[180px] truncate px-4 py-2.5">{item.owner}</td><td className="max-w-[180px] truncate px-4 py-2.5">{item.borrower}</td><td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600">{item.operator}</td><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatTime(item.returnDate || item.date)}</td><td className="px-4 py-2 text-right"><button type="button" onClick={() => onSelect(item)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:border-orange-400 hover:text-orange-600"><Eye className="size-3.5" />ดูใบเสร็จ</button></td></tr>)}</tbody></table></div>}</div>;
  })}{!items.length && <Empty text="ไม่พบประวัติการเบิกหรือคืนตามตัวกรอง" />}</div>;
}

function EditModal({ modal, data, onClose, onSave }: { modal: NonNullable<Modal>; data: AdminData; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const item = modal.item || {};
  usePopupDismiss(true, onClose);
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget).entries())); };
  return <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form onSubmit={submit} className="popup-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Admin Action</p><h2 className="text-xl font-bold">{modal.type === "transfer" ? "เคลื่อนย้ายยุทโธปกรณ์ระหว่างกองร้อย" : "จัดการข้อมูล"}</h2></div><button type="button" onClick={onClose}><X /></button></div><input type="hidden" name="action" value={modal.type === "transfer" ? "transfer-inventory" : `save-${modal.type}`} /><input type="hidden" name="id" value={String(item.id || "")} /><div className="mt-5 grid gap-4 sm:grid-cols-2">
    {modal.type === "company" && <Input name="name" label="ชื่อกองร้อย" value={item.name} />}
    {modal.type === "user" && <><Select name="companyId" label="กองร้อย" value={item.companyId} options={data.companies.map((company) => [company.id, company.name])} /><Select name="role" label="สิทธิ์" value={item.role || "User"} options={[["User", "User"], ["Admin", "Admin"]]} /><Input name="rank" label="ยศ" value={item.rank} /><Input name="firstName" label="ชื่อ" value={item.firstName} /><Input name="lastName" label="นามสกุล" value={item.lastName} /><Input name="email" label="อีเมลเข้าสู่ระบบ" value={item.email} type="email" /><Input name="phone" label="เบอร์โทร" value={item.phone} optional /><Input name="gmail" label="Gmail กู้คืน" value={item.gmail} type="email" optional /><Input name="password" label={item.id ? "รหัสผ่านใหม่ (เว้นว่างได้)" : "รหัสผ่านเริ่มต้น"} type="password" optional={Boolean(item.id)} /></>}
    {modal.type === "equipment" && <><Input name="name" label="ชื่อยุทโธปกรณ์" value={item.name} /><CategoryInput value={item.category} categories={[...new Set(data.equipments.map((equipment) => equipment.category).filter(Boolean))].sort((first, second) => first.localeCompare(second, "th"))} /><label className="flex items-center gap-3 sm:col-span-2"><input type="checkbox" name="requirePlate" value="true" defaultChecked={Boolean(item.requirePlate)} /> แยกรายคัน/ทะเบียน</label></>}
    {modal.type === "inventory" && <><Select name="companyId" label="กองร้อย" value={item.companyId} options={data.companies.map((company) => [company.id, company.name])} /><Select name="equipmentId" label="ยุทโธปกรณ์" value={item.equipmentId} options={data.equipments.map((equipment) => [equipment.id, `${equipment.name} · ${equipment.category}`])} /><Input name="plateNumber" label="ทะเบียน/หมายเลข" value={item.plateNumber} optional /><Input name="total" label="รวม" value={item.total ?? 0} type="number" /><Input name="available" label="พร้อมใช้" value={item.available ?? 0} type="number" /><Input name="borrowed" label="ถูกยืม" value={item.borrowed ?? 0} type="number" /><Input name="broken" label="ชำรุด" value={item.broken ?? 0} type="number" /></>}
    {modal.type === "transfer" && <><Select name="sourceInventoryId" label="รายการต้นทาง" options={data.inventories.filter((inventory) => inventory.available > 0).map((inventory) => [inventory.id, `${inventory.companyName} · ${inventory.equipmentName}${inventory.plateNumber ? ` · ${inventory.plateNumber}` : ""} · พร้อม ${inventory.available}`])} /><Select name="destinationCompanyId" label="กองร้อยปลายทาง" options={data.companies.map((company) => [company.id, company.name])} /><Input name="quantity" label="จำนวนที่ต้องการเคลื่อนย้าย" value={1} type="number" /><div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">เคลื่อนย้ายได้เฉพาะยอดพร้อมใช้ ระบบจะปรับยอดต้นทางและปลายทางพร้อมบันทึก Audit Log ในครั้งเดียว</div></>}
  </div><button className="mt-6 h-12 w-full rounded-full bg-blue-600 font-bold text-white">ยืนยันและบันทึก Audit Log</button></form></div>;
}

function CompanyFilter({ value, onChange, companies }: { value: string; onChange: (value: string) => void; companies: AdminData["companies"] }) {
  return <label className="relative block min-w-0 flex-1 sm:max-w-sm"><Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold"><option value="">แสดงทั้งหมด</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>;
}

function GroupedCards<T>({ items, companies, getCompanyId, getKey, render }: { items: T[]; companies: AdminData["companies"]; getCompanyId: (item: T) => string; getKey: (item: T) => string; render: (item: T) => React.ReactNode }) {
  const companyOrder = new Map(companies.map((company, index) => [company.id, index]));
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const groups = [...items.reduce((result, item) => { const companyId = getCompanyId(item); const key = companyId || "unknown"; const current = result.get(key) || []; current.push(item); result.set(key, current); return result; }, new Map<string, T[]>()).entries()].sort(([first], [second]) => (companyOrder.get(first) ?? 999) - (companyOrder.get(second) ?? 999));
  return <div className="space-y-5">{groups.map(([companyId, records]) => <section key={companyId}><div className="mb-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 font-bold text-blue-800"><Building2 className="size-4" />{companyNames.get(companyId) || "ไม่สามารถระบุกองร้อย"}<span className="ml-auto text-xs font-semibold text-blue-600">{records.length.toLocaleString("th-TH")} รายการ</span></div><div className="space-y-3">{records.map((item) => <div key={getKey(item)}>{render(item)}</div>)}</div></section>)}</div>;
}

function Toolbar({ children }: { children: React.ReactNode }) { return <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">{children}</div>; }
function Section({ title, action, onAdd, children }: { title: string; action?: string; onAdd?: () => void; children: React.ReactNode }) { return <section className="mt-6"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-lg font-bold">{title}</h3>{action && <button type="button" onClick={onAdd} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white"><PackagePlus className="size-4" />{action}</button>}</div>{children}</section>; }
function Card({ title, detail, meta, onClick }: { title: string; detail: string; meta: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-md transition hover:border-blue-300 active:scale-[0.99]"><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-blue-600">{detail}</p><p className="mt-2 truncate text-xs text-slate-500">{meta}</p></button>; }
function Stat({ number, label }: { number: number; label: string }) { return <div><p className="text-lg font-bold">{number.toLocaleString("th-TH")}</p><p className="text-slate-500">{label}</p></div>; }
function Summary({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value.toLocaleString("th-TH")}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }
function Input({ name, label, value = "", type = "text", optional = false }: { name: string; label: string; value?: unknown; type?: string; optional?: boolean }) { return <label className="block"><span className="mb-1 block text-sm font-semibold">{label}</span><input name={name} type={type} defaultValue={String(value)} required={!optional} min={type === "number" ? 0 : undefined} className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>; }
function CategoryInput({ value = "", categories }: { value?: unknown; categories: string[] }) { return <label className="block"><span className="mb-1 block text-sm font-semibold">หมวดหมู่</span><input name="category" list="admin-equipment-categories" defaultValue={String(value)} required placeholder="เลือกหรือพิมพ์หมวดหมู่ใหม่" autoComplete="off" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" /><datalist id="admin-equipment-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist><span className="mt-1 block text-xs text-slate-500">เลือกจากหมวดหมู่ปัจจุบัน หรือพิมพ์ชื่อหมวดหมู่ใหม่ได้</span></label>; }
function Select({ name, label, value = "", options }: { name: string; label: string; value?: unknown; options: string[][] }) { return <label className="min-w-0"><span className="mb-1 block text-sm font-semibold">{label}</span><select name={name} defaultValue={String(value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>; }
const format = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value || "-" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date); };
const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date); };
