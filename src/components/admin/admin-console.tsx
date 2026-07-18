"use client";

import {
  Activity,
  Ambulance,
  Anchor,
  ArrowRightLeft,
  Axe,
  Backpack,
  BatteryCharging,
  BellRing,
  Binoculars,
  Biohazard,
  Bomb,
  BowArrow,
  Boxes,
  Building2,
  Cable,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Cog,
  Compass,
  Copy,
  Crosshair,
  Cpu,
  Database,
  Download,
  FileImage,
  FileText,
  Filter,
  Flag,
  Flame,
  Fuel,
  Hammer,
  HardHat,
  Eye,
  LogOut,
  Menu,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  Trash2,
  Truck,
  Plane,
  Shield,
  GraduationCap,
  Hash,
  LifeBuoy,
  ListChecks,
  Map as MapIcon,
  Minus,
  Package,
  Plus,
  Radio,
  RadioTower,
  Radar,
  Rocket,
  SatelliteDish,
  Shell,
  Ship,
  Shirt,
  Siren,
  Sword,
  Swords,
  Target,
  Telescope,
  TentTree,
  TowerControl,
  Utensils,
  Warehouse,
  X,
  Zap,
  Medal,
  BriefcaseMedical,
  Drone,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { AdminAiAssistant } from "@/components/admin/admin-ai-assistant";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CompactSelect, type CompactSelectOption } from "@/components/ui/compact-select";
import { compressImageForSheet, receiptCanvas } from "@/lib/client-media";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import type { AdminAuditLog, AdminData, AdminMaintenance, AdminTransaction } from "@/lib/admin-service";

type Tab = "overview" | "users" | "equipment" | "inventory" | "transactions" | "maintenance" | "logs";
type Modal = { type: "company" | "user" | "equipment" | "category" | "inventory" | "inventory-add" | "inventory-batch-add" | "transfer"; item?: Record<string, unknown> } | null;

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
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Set<string>>(new Set());
  const [batchInventoryOpen, setBatchInventoryOpen] = useState(false);
  const [transactionCompany, setTransactionCompany] = useState("");
  const [maintenanceCompany, setMaintenanceCompany] = useState("");
  const [logCompany, setLogCompany] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [maintenanceDate, setMaintenanceDate] = useState("");
  const [logDate, setLogDate] = useState("");
  const [maintenanceView, setMaintenanceView] = useState<"active" | "history">("active");
  const [companyDetail, setCompanyDetail] = useState("");
  const [deleteCompanyItem, setDeleteCompanyItem] = useState<AdminData["companies"][number] | null>(null);
  const [receipt, setReceipt] = useState<AdminTransaction | null>(null);
  const [maintenanceReceipt, setMaintenanceReceipt] = useState<AdminMaintenance | null>(null);
  const [auditDetail, setAuditDetail] = useState<AdminAuditLog | null>(null);
  const [equipmentSummary, setEquipmentSummary] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [deleteEquipmentCategory, setDeleteEquipmentCategory] = useState("");
  const [borrowedSummary, setBorrowedSummary] = useState(false);
  const [returnTransactionItem, setReturnTransactionItem] = useState<AdminTransaction | null>(null);
  const [deleteInventoryItem, setDeleteInventoryItem] = useState<AdminData["inventories"][number] | null>(null);
  const [disposeItem, setDisposeItem] = useState<AdminMaintenance | null>(null);
  const [historyDelete, setHistoryDelete] = useState<{ ids: string[]; all: boolean; count: number } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const keyword = query.trim().toLowerCase();
  const match = useCallback((...values: unknown[]) => !keyword || values.join(" ").toLowerCase().includes(keyword), [keyword]);
  usePopupDismiss(Boolean(companyDetail), () => setCompanyDetail(""));
  usePopupDismiss(Boolean(deleteCompanyItem), () => setDeleteCompanyItem(null));
  usePopupDismiss(Boolean(auditDetail), () => setAuditDetail(null));
  usePopupDismiss(equipmentSummary, () => setEquipmentSummary(false));
  usePopupDismiss(categoryManagerOpen && !modal, () => setCategoryManagerOpen(false));
  usePopupDismiss(Boolean(deleteEquipmentCategory), () => setDeleteEquipmentCategory(""));
  usePopupDismiss(borrowedSummary && !returnTransactionItem && !receipt, () => setBorrowedSummary(false));
  usePopupDismiss(Boolean(returnTransactionItem), () => setReturnTransactionItem(null));
  usePopupDismiss(Boolean(deleteInventoryItem), () => setDeleteInventoryItem(null));
  usePopupDismiss(Boolean(disposeItem), () => setDisposeItem(null));
  usePopupDismiss(Boolean(historyDelete), () => setHistoryDelete(null));

  const filtered = useMemo(() => ({
    users: initialData.users.filter((item) => match(item.firstName, item.lastName, item.email, item.rank, item.companyName)),
    inventories: initialData.inventories.filter((item) => (!inventoryCompany || item.companyId === inventoryCompany) && match(item.equipmentName, item.category, item.companyName, item.plateNumber)),
    transactions: initialData.transactions.filter((item) => (!transactionCompany || item.ownerCompanyId === transactionCompany || item.borrowerCompanyId === transactionCompany) && (!transactionDate || localDateKey(item.returnDate || item.date) === transactionDate) && match(item.id, item.equipmentName, item.owner, item.borrower, item.operator, item.status)),
    maintenance: initialData.maintenance.filter((item) => (!maintenanceCompany || item.companyId === maintenanceCompany) && (!maintenanceDate || localDateKey(item.completedAt || item.date) === maintenanceDate) && (maintenanceView === "history" ? ["completed", "disposed"].includes(item.status.toLowerCase()) : !["completed", "disposed"].includes(item.status.toLowerCase())) && match(item.id, item.equipmentName, item.companyName, item.operator, item.status, item.note)),
    logs: initialData.logs.filter((item) => (!logCompany || item.companyIds.includes(logCompany)) && (!logDate || localDateKey(item.timestamp) === logDate) && match(item.id, item.user, item.action, item.target, item.targetLabel, item.details)),
  }), [initialData, inventoryCompany, logCompany, logDate, maintenanceCompany, maintenanceDate, maintenanceView, match, transactionCompany, transactionDate]);
  const visibleSelectedInventoryIds = useMemo(() => {
    const visibleIds = new Set(filtered.inventories.map((item) => item.id));
    return new Set([...selectedInventoryIds].filter((id) => visibleIds.has(id)));
  }, [filtered.inventories, selectedInventoryIds]);
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(""), 3000); return () => window.clearTimeout(timeout); }, [message]);

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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาผู้ใช้ กองร้อย ยุทโธปกรณ์ เลขที่เอกสาร หรือ Log..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none focus:border-blue-500" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200" aria-label="ล้างคำค้นหา"><X className="size-4" /></button>}
          </div>
          <button type="button" onClick={() => startRefresh(() => router.refresh())} className="grid size-10 place-items-center rounded-xl border border-slate-200"><RefreshCw className="size-4" /></button>
          <ThemeToggle />
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-semibold text-blue-600">ศูนย์ควบคุมส่วนกลาง</p><h2 className="text-2xl font-bold">{tabs.find((item) => item.id === tab)?.label}</h2></div>
            {message && <button type="button" onClick={() => setMessage("")} className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-700">{message}</button>}
          </div>

          {tab === "overview" && <section className="relative mt-6 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#103b68] via-[#135b91] to-[#1984c8] p-6 text-white shadow-xl sm:p-9"><div className="absolute -right-14 -top-20 size-56 rounded-full border-[32px] border-white/5" /><div className="relative"><p className="text-sm font-semibold text-blue-100">Tactical Equipment Management System</p><h2 className="mt-3 max-w-4xl text-2xl font-bold leading-tight sm:text-4xl">ศูนย์ควบคุมและบริหารจัดการยุทโธปกรณ์ส่วนกลาง</h2><p className="mt-5 text-sm text-blue-100">ผู้ดูแลระบบ: {adminName}</p></div><div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-300 via-amber-300 to-cyan-300" /></section>}

          {tab === "overview" && <CompanyGrid data={initialData} onSelect={setCompanyDetail} onAdd={() => setModal({ type: "company" })} />}
          {tab === "overview" && <Overview data={initialData} onEquipment={() => setEquipmentSummary(true)} onUsers={() => setTab("users")} onBorrowed={() => setBorrowedSummary(true)} onMaintenance={() => setTab("maintenance")} />}
          {tab === "users" && <Section title={`ผู้ใช้ทั้งหมด ${initialData.users.length.toLocaleString("th-TH")} คน`} action="เพิ่มผู้ใช้" onAdd={() => setModal({ type: "user" })}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.users.map((item) => <Card key={item.id} onClick={() => setModal({ type: "user", item: item as unknown as Record<string, unknown> })} title={`${item.rank} ${item.firstName} ${item.lastName}`} detail={`${item.role} · ${item.companyName}`} meta={`${item.email} · ${item.phone || "ไม่มีเบอร์"}`} />)}</div></Section>}
          {tab === "equipment" && <Section title="บัญชียุทโธปกรณ์แม่"><EquipmentCatalog items={initialData.equipments.filter((item) => match(item.name, item.category))} onAdd={() => setModal({ type: "equipment" })} onManageCategories={() => setCategoryManagerOpen(true)} onEdit={(item) => setModal({ type: "equipment", item: item as unknown as Record<string, unknown> })} /></Section>}

          {tab === "inventory" && (
            <Section title={inventoryCompany ? `คลัง ${initialData.companies.find((item) => item.id === inventoryCompany)?.name}` : "คลังทุกกองร้อย"}>
              <Toolbar>
                <CompanyFilter value={inventoryCompany} onChange={(companyId) => { setInventoryCompany(companyId); setSelectedInventoryIds(new Set()); }} companies={initialData.companies} />
                <button type="button" disabled={!visibleSelectedInventoryIds.size} onClick={() => setBatchInventoryOpen(true)} className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><ListChecks className="size-4" />จัดการที่เลือก {visibleSelectedInventoryIds.size ? `${visibleSelectedInventoryIds.size} รายการ` : ""}</button>
                <button type="button" onClick={() => setModal({ type: "inventory", item: { companyId: inventoryCompany } })} className="flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700"><Database className="size-4" />จัดการอาวุธในคลัง</button>
                <button type="button" onClick={() => setModal({ type: "inventory-batch-add", item: { companyId: inventoryCompany } })} className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"><PackagePlus className="size-4" />เพิ่มหลายรายการเข้าคลัง</button>
                <button type="button" onClick={() => setModal({ type: "transfer" })} className="flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"><ArrowRightLeft className="size-4" />เคลื่อนย้ายยุทโธปกรณ์</button>
              </Toolbar>
              <InventoryTable items={filtered.inventories} groupByCompany={!inventoryCompany} onEdit={(item) => setModal({ type: "inventory", item: item as unknown as Record<string, unknown> })} onDelete={setDeleteInventoryItem} selectedIds={visibleSelectedInventoryIds} onSelectionChange={setSelectedInventoryIds} />
            </Section>
          )}

          {tab === "transactions" && (
            <Section title="ประวัติการเบิกและคืนทั้งหมด">
              <Toolbar><CompanyFilter value={transactionCompany} onChange={setTransactionCompany} companies={initialData.companies} /><DateFilter value={transactionDate} onChange={setTransactionDate} /><button type="button" disabled={!initialData.transactions.some(canDeleteTransaction)} onClick={() => setHistoryDelete({ ids: [], all: true, count: initialData.transactions.filter(canDeleteTransaction).length })} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-4" />ล้างประวัติทั้งหมด</button></Toolbar>
              <AdminTransactionTable key={`${transactionCompany}:${transactionDate}:${keyword}`} items={filtered.transactions} onSelect={setReceipt} onReturn={setReturnTransactionItem} onDelete={(ids) => setHistoryDelete({ ids, all: false, count: ids.length })} />
            </Section>
          )}

          {tab === "maintenance" && (
            <Section title={maintenanceView === "active" ? "รายการซ่อมบำรุงปัจจุบัน" : "ประวัติการส่งซ่อม"}>
              <Toolbar>
                <CompanyFilter value={maintenanceCompany} onChange={setMaintenanceCompany} companies={initialData.companies} />
                <DateFilter value={maintenanceDate} onChange={setMaintenanceDate} />
                <div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setMaintenanceView("active")} className={`rounded-lg px-3 py-2 text-sm font-bold ${maintenanceView === "active" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>กำลังซ่อม</button><button type="button" onClick={() => setMaintenanceView("history")} className={`rounded-lg px-3 py-2 text-sm font-bold ${maintenanceView === "history" ? "bg-white text-blue-700 shadow" : "text-slate-500"}`}>ประวัติซ่อมเสร็จ</button></div>
              </Toolbar>
              <MaintenanceTable items={filtered.maintenance} active={maintenanceView === "active"} onSelect={setMaintenanceReceipt} onStatus={(item, status) => mutate({ action: "maintenance-status", id: item.id, status })} onDispose={setDisposeItem} emptyText={maintenanceView === "active" ? "ไม่มีรายการที่กำลังซ่อม" : "ยังไม่มีประวัติซ่อมเสร็จ"} />
            </Section>
          )}

          {tab === "logs" && (
            <Section title="บันทึกการเปลี่ยนแปลงทั้งหมด">
              <Toolbar><CompanyFilter value={logCompany} onChange={setLogCompany} companies={initialData.companies} /><DateFilter value={logDate} onChange={setLogDate} /></Toolbar>
              <AuditLogTable items={filtered.logs} onSelect={setAuditDetail} />
            </Section>
          )}
        </main>
        <footer className="tems-mobile-footer-spacer" aria-hidden="true" />
      </div>

      {companyDetail && <CompanyDetail data={initialData} companyId={companyDetail} onClose={() => setCompanyDetail("")} onOpenInventory={openInventoryForCompany} onDelete={(company) => { setCompanyDetail(""); setDeleteCompanyItem(company); }} />}
      {maintenanceReceipt && <AdminMaintenanceReceiptModal maintenance={maintenanceReceipt} onClose={() => setMaintenanceReceipt(null)} />}
      {auditDetail && <AuditDetailModal log={auditDetail} onClose={() => setAuditDetail(null)} />}
      {equipmentSummary && <EquipmentSummaryModal data={initialData} onClose={() => setEquipmentSummary(false)} />}
      {categoryManagerOpen && <CategoryManagerModal categories={initialData.categories} equipments={initialData.equipments} onClose={() => setCategoryManagerOpen(false)} onAdd={() => setModal({ type: "category" })} onEdit={(item) => setModal({ type: "category", item: item as unknown as Record<string, unknown> })} onDelete={setDeleteEquipmentCategory} />}
      {deleteEquipmentCategory && <ConfirmCategoryDeleteModal category={deleteEquipmentCategory} count={initialData.equipments.filter((item) => item.category === deleteEquipmentCategory).length} onClose={() => setDeleteEquipmentCategory("")} onConfirm={() => { const category = deleteEquipmentCategory; setDeleteEquipmentCategory(""); mutate({ action: "delete-equipment-category", category }); }} />}
      {borrowedSummary && <BorrowedSummaryModal data={initialData} onClose={() => setBorrowedSummary(false)} onSelect={setReceipt} onReturn={setReturnTransactionItem} />}
      {receipt && <AdminReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />}
      {returnTransactionItem && <ConfirmTransactionReturnModal item={returnTransactionItem} onClose={() => setReturnTransactionItem(null)} onConfirm={() => { const item = returnTransactionItem; setReturnTransactionItem(null); mutate({ action: "return-transaction", id: item.id }); }} />}
      {deleteCompanyItem && <DeleteCompanyModal company={deleteCompanyItem} onClose={() => setDeleteCompanyItem(null)} onConfirm={(adminPassword, confirmName) => { const company = deleteCompanyItem; setDeleteCompanyItem(null); mutate({ action: "delete-company", id: company.id, adminPassword, confirmName }); }} />}
      {disposeItem && <ConfirmDisposeModal item={disposeItem} onClose={() => setDisposeItem(null)} onConfirm={() => { const item = disposeItem; setDisposeItem(null); mutate({ action: "dispose-maintenance", id: item.id }); }} />}
      {deleteInventoryItem && <ConfirmInventoryDeleteModal item={deleteInventoryItem} onClose={() => setDeleteInventoryItem(null)} onConfirm={() => { const item = deleteInventoryItem; setDeleteInventoryItem(null); mutate({ action: "delete-inventory", id: item.id }); }} />}
      {historyDelete && <ConfirmHistoryDeleteModal request={historyDelete} onClose={() => setHistoryDelete(null)} onConfirm={() => { const request = historyDelete; setHistoryDelete(null); mutate({ action: "delete-transaction-history", ids: request.ids, all: request.all }); }} />}
      {batchInventoryOpen && <BatchInventoryModal items={initialData.inventories.filter((item) => visibleSelectedInventoryIds.has(item.id))} onClose={() => setBatchInventoryOpen(false)} onConfirm={(items) => { setBatchInventoryOpen(false); setSelectedInventoryIds(new Set()); mutate({ action: "batch-adjust-inventory", items }); }} />}
      {modal?.type === "inventory-batch-add" && <InventoryBatchAddModal data={initialData} initialCompanyId={String(modal.item?.companyId || "")} onClose={() => setModal(null)} onConfirm={(items) => mutate({ action: "batch-add-inventory", items })} />}
      {modal && modal.type !== "inventory-batch-add" && <EditModal modal={modal} data={initialData} onClose={() => setModal(null)} onSave={mutate} />}
      <AdminAiAssistant />
    </div>
  );
}

function Overview({ data, onEquipment, onUsers, onBorrowed, onMaintenance }: { data: AdminData; onEquipment: () => void; onUsers: () => void; onBorrowed: () => void; onMaintenance: () => void }) {
  const metrics = [
    { label: "ยุทโธปกรณ์รวม", value: data.companies.reduce((sum, item) => sum + item.total, 0), Icon: Boxes, onClick: onEquipment, hint: "ดูจำนวนทั้งหมดแยกตามชนิด" },
    { label: "ผู้ใช้งาน", value: data.users.length, Icon: Users, onClick: onUsers, hint: "เปิดหน้าจัดการผู้ใช้งาน" },
    { label: "กำลังยืม", value: data.transactions.filter((item) => item.activeBorrow).length, Icon: Activity, onClick: onBorrowed, hint: "ดูผู้ยืมและรายการทั้งหมด" },
    { label: "กำลังซ่อม", value: data.maintenance.filter((item) => !["completed", "disposed"].includes(item.status.toLowerCase())).length, Icon: Wrench, onClick: onMaintenance, hint: "เปิดหน้าซ่อมบำรุง" },
  ];
  return <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(({ label, value, Icon, onClick, hint }) => <button type="button" key={label} onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-md transition hover:-translate-y-0.5 hover:border-blue-400 active:scale-[0.99]"><Icon className="size-5 text-blue-600" /><p className="mt-5 text-sm text-slate-500">{label}</p><p className="text-3xl font-bold">{value.toLocaleString("th-TH")}</p><span className="mt-2 block text-xs font-semibold text-blue-600">{hint}</span></button>)}</section>;
}

function CompanyGrid({ data, onSelect, onAdd }: { data: AdminData; onSelect: (id: string) => void; onAdd: () => void }) {
  return <Section title="ทุกกองร้อย" action="เพิ่มกองร้อย" onAdd={onAdd}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.companies.map((item) => { const Icon = companyIcon(item.name); return <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-md transition hover:-translate-y-1 hover:border-blue-400 active:scale-[0.99]"><div className="flex justify-between"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-6" /></span><span className="text-xs text-slate-500">{item.users} ผู้ใช้</span></div><h3 className="mt-4 text-lg font-bold">{item.name}</h3><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><Stat number={item.total} label="รวม" /><Stat number={item.available} label="พร้อม" /><Stat number={item.borrowed} label="ยืม" /><Stat number={item.broken} label="เสีย" /></div><p className="mt-4 text-xs font-semibold text-blue-600">ดูรายละเอียดคลังและหมวดหมู่ →</p></button>; })}</div></Section>;
}

function CompanyDetail({ data, companyId, onClose, onOpenInventory, onDelete }: { data: AdminData; companyId: string; onClose: () => void; onOpenInventory: (id: string) => void; onDelete: (company: AdminData["companies"][number]) => void }) {
  const company = data.companies.find((item) => item.id === companyId);
  const stock = data.inventories.filter((item) => item.companyId === companyId);
  const categories = [...stock.reduce((groups, item) => {
    const current = groups.get(item.category) || { total: 0, available: 0, broken: 0, items: 0 };
    current.total += item.total; current.available += item.available; current.broken += item.broken; current.items += 1;
    groups.set(item.category, current);
    return groups;
  }, new Map<string, { total: number; available: number; broken: number; items: number }>()).entries()];
  return <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-[30px] bg-slate-50 p-5 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">รายละเอียดกองร้อย</p><h2 className="text-2xl font-bold">{company?.name}</h2><p className="mt-1 text-sm text-slate-500">แสดงยอดจริง แยกหมวดหมู่และรายการย่อยในคลัง</p></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-white shadow"><X className="size-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="รวมทั้งหมด" value={company?.total || 0} tone="text-blue-700" /><Summary label="พร้อมใช้" value={company?.available || 0} tone="text-emerald-700" /><Summary label="ถูกยืม" value={company?.borrowed || 0} tone="text-amber-700" /><Summary label="ชำรุด" value={company?.broken || 0} tone="text-red-700" /></div><h3 className="mt-7 font-bold">สรุปตามหมวดหมู่</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map(([name, value]) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="font-bold text-blue-700">{name}</p><p className="mt-3 text-2xl font-bold">{value.total.toLocaleString("th-TH")}</p><p className="text-xs text-slate-500">{value.items} รายการย่อย · พร้อม {value.available.toLocaleString("th-TH")} · เสีย {value.broken.toLocaleString("th-TH")}</p></div>)}</div><h3 className="mt-7 font-bold">รายการยุทโธปกรณ์ในคลัง</h3><InventoryTable items={stock} /><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><button type="button" onClick={() => onOpenInventory(companyId)} className="h-12 rounded-full bg-blue-600 px-6 font-bold text-white">เปิดหน้าจัดการคลังกองร้อยนี้</button>{company && <button type="button" onClick={() => onDelete(company)} className="flex h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-6 font-bold text-red-700 hover:bg-red-100"><Trash2 className="size-4" />ลบกองร้อย</button>}</div></div></div>;
}

function AdminReceiptModal({ transaction, onClose }: { transaction: AdminTransaction; onClose: () => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloads, setDownloads] = useState(false);
  const [processing, setProcessing] = useState(false);
  const returned = transaction.movementType === "return";
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
  return <>{processing && <ActionLoadingOverlay message="กำลังสร้างไฟล์ใบเสร็จ..." />}<div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]"><div ref={receiptRef}><ReceiptDocument title={returned ? "รายละเอียดการคืนยุทโธปกรณ์" : "รายละเอียดการเบิกยุทโธปกรณ์"} referenceId={transaction.id} status={returned ? "คืนแล้ว" : "บันทึกการเบิกแล้ว"} date={returned ? transaction.returnDate || transaction.date : transaction.date} operatorName={transaction.operator} contactPhone={transaction.operatorPhone} contactEmail={transaction.operatorEmail} ownerCompanyName={returned ? transaction.borrower : transaction.owner} borrowerCompanyName={returned ? transaction.owner : transaction.borrower} dueDate={!returned ? transaction.dueDate : undefined} note={transaction.note} evidenceImage={transaction.evidenceImage} items={[{ name: transaction.equipmentName, quantity: transaction.quantity, plateNumber: transaction.plateNumber || undefined }]} /></div><div className="mt-4 flex gap-3"><button type="button" onClick={onClose} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button><button type="button" onClick={() => setDownloads(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white"><Download className="size-5" /></button></div></div></div>{downloads && <div className="popup-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setDownloads(false); }}><div className="popup-panel w-full max-w-xs rounded-[24px] bg-white p-5"><div className="flex justify-between"><h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3><button type="button" onClick={() => setDownloads(false)}><X className="size-5" /></button></div><div className="mt-4 space-y-3"><button type="button" onClick={() => download("jpg")} className="flex w-full items-center gap-3 rounded-xl bg-blue-50 p-4 font-semibold text-blue-700"><FileImage className="size-5" />ไฟล์รูป JPG</button><button type="button" onClick={() => download("pdf")} className="flex w-full items-center gap-3 rounded-xl bg-red-50 p-4 font-semibold text-red-700"><FileText className="size-5" />ไฟล์ PDF</button></div></div></div>}</>;
}

function AdminMaintenanceReceiptModal({ maintenance, onClose }: { maintenance: AdminMaintenance; onClose: () => void }) {
  usePopupDismiss(true, onClose);
  return <div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]"><div className="mb-3 flex items-center gap-3 rounded-2xl border border-orange-200 bg-white p-3"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-50 p-1"><Image src={maintenance.picture} alt={maintenance.equipmentName} width={64} height={64} unoptimized className="size-full object-contain" /></span><span className="min-w-0"><span className="block truncate font-bold">{maintenance.equipmentName}</span><span className="mt-1 block text-xs font-semibold text-orange-700">{maintenance.plateNumber ? `ทะเบียน/หมายเลข ${maintenance.plateNumber}` : `${maintenance.quantity.toLocaleString("th-TH")} รายการ`}</span></span></div><ReceiptDocument title="รายละเอียดการแจ้งยุทโธปกรณ์ชำรุด" referenceId={maintenance.id} status={maintenance.status} date={maintenance.date} operatorName={maintenance.operator} contactPhone={maintenance.operatorPhone} contactEmail={maintenance.operatorEmail} ownerCompanyName={maintenance.companyName} borrowerCompanyName={maintenance.companyName} note={maintenance.note} evidenceImage={maintenance.evidenceImage} items={[{ name: maintenance.equipmentName, quantity: maintenance.quantity, plateNumber: maintenance.plateNumber || undefined }]} /><button type="button" onClick={onClose} className="mt-4 h-12 w-full rounded-full bg-white font-bold text-slate-600">ปิด</button></div></div>;
}

function InventoryTable({ items, onEdit, onDelete, groupByCompany = false, selectedIds, onSelectionChange }: { items: AdminData["inventories"]; onEdit?: (item: AdminData["inventories"][number]) => void; onDelete?: (item: AdminData["inventories"][number]) => void; groupByCompany?: boolean; selectedIds?: Set<string>; onSelectionChange?: (ids: Set<string>) => void }) {
  const ordered = [...items].sort((first, second) => `${first.companyName} ${first.category} ${first.equipmentName}`.localeCompare(`${second.companyName} ${second.category} ${second.equipmentName}`, "th"));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectable = Boolean(selectedIds && onSelectionChange);
  const selectableRows = groupByCompany ? ordered.filter((item) => !collapsed.has(item.companyName)) : ordered;
  const allSelected = selectable && selectableRows.length > 0 && selectableRows.every((item) => selectedIds?.has(item.id));
  const toggleAll = (checked: boolean) => onSelectionChange?.(checked ? new Set(selectableRows.map((item) => item.id)) : new Set());
  return <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className={`w-full ${selectable ? "min-w-[1100px]" : "min-w-[1040px]"} text-sm`}><thead className="bg-slate-50"><tr>{selectable && <th className="w-12 p-3 text-center"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} aria-label="เลือกยุทโธปกรณ์ทั้งหมดที่แสดง" /></th>}{["เลขที่คลัง", "ยุทโธปกรณ์", "หมวดหมู่", "กองร้อย", "Serial/ทะเบียน", "รวม", "พร้อม", "ให้ยืม", "เสีย", "จัดการ"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{ordered.map((item, index) => { const newCompany = groupByCompany && item.companyName !== ordered[index - 1]?.companyName; const hidden = collapsed.has(item.companyName); const selected = selectedIds?.has(item.id) || false; return <Fragment key={item.id}>{newCompany && <tr><td colSpan={selectable ? 11 : 10} className="border-t border-blue-200 bg-blue-50 p-0"><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(item.companyName)) next.delete(item.companyName); else next.add(item.companyName); return next; })} className="flex w-full items-center gap-2 px-4 py-3 font-bold text-blue-800"><ChevronDown className={`size-4 transition-transform ${hidden ? "-rotate-90" : ""}`} /><Building2 className="size-4" />{item.companyName}</button></td></tr>}{(!groupByCompany || !hidden) && <tr onClick={() => { if (selectable) { const next = new Set(selectedIds); if (selected) next.delete(item.id); else next.add(item.id); onSelectionChange?.(next); } else onEdit?.(item); }} onContextMenu={(event) => { if (!onEdit) return; event.preventDefault(); onEdit(item); }} title={selectable ? "คลิกเพื่อเลือก · คลิกขวาเพื่อจัดการ" : undefined} className={`border-t border-slate-100 transition ${selected ? "bg-emerald-50/70" : ""} ${(selectable || onEdit) ? "cursor-pointer hover:bg-blue-50" : ""}`}>{selectable && <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={(event) => { const next = new Set(selectedIds); if (event.target.checked) next.add(item.id); else next.delete(item.id); onSelectionChange?.(next); }} aria-label={`เลือก ${item.equipmentName}`} /></td>}<DocumentCell id={item.id} /><td className="p-3 font-semibold"><span className="flex items-center gap-2"><Image src={item.picture} alt="" width={32} height={32} unoptimized className="size-8 object-contain" />{item.equipmentName}</span></td><td>{item.category}</td><td>{item.companyName}</td><td className={item.requirePlate ? "font-mono font-semibold text-violet-700" : "text-slate-400"}>{item.plateNumber || "-"}</td><td>{item.total}</td><td className="text-emerald-600">{item.available}</td><td className="text-amber-600">{item.borrowed}</td><td className="text-red-600">{item.broken}</td><td className="p-2"><div className="flex items-center justify-end gap-2">{onEdit && <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(item); }} className="grid size-9 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 active:scale-95" aria-label={`จัดการ ${item.equipmentName}`} title="จัดการรายการ"><Settings className="size-4" /></button>}{onDelete && <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(item); }} className="grid size-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-95" aria-label={`ลบ ${item.equipmentName}`} title="ลบรายการ"><Trash2 className="size-4" /></button>}</div></td></tr>}</Fragment>; })}</tbody></table>{!items.length && <Empty text="ไม่พบรายการในคลัง" />}</div>;
}

function canDeleteTransaction(item: AdminTransaction) {
  return !item.activeBorrow;
}

function AdminTransactionTable({ items, onSelect, onReturn, onDelete }: { items: AdminTransaction[]; onSelect: (item: AdminTransaction) => void; onReturn: (item: AdminTransaction) => void; onDelete: (ids: string[]) => void }) {
  const groups = useMemo(() => groupRecordsByDate(items, (item) => item.returnDate || item.date), [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return <div>
    {selected.size > 0 && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"><p className="text-sm font-semibold text-red-800">เลือกแล้ว {selected.size.toLocaleString("th-TH")} รายการ</p><div className="flex gap-2"><button type="button" onClick={() => setSelected(new Set())} className="h-9 rounded-lg bg-white px-3 text-xs font-bold text-slate-600">ยกเลิกการเลือก</button><button type="button" onClick={() => { const ids = [...selected]; setSelected(new Set()); onDelete(ids); }} className="flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"><Trash2 className="size-3.5" />ล้างรายการที่เลือก</button></div></div>}
    <DatedTableShell groups={groups} collapsed={collapsed} setCollapsed={setCollapsed} emptyText="ไม่พบประวัติการเบิกหรือคืนตามตัวกรอง" render={(records) => {
      const deletableRecords = records.filter(canDeleteTransaction);
      const allSelected = deletableRecords.length > 0 && deletableRecords.every((item) => selected.has(item.id));
      return <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="border-y border-slate-200 text-left text-xs text-slate-500"><tr><th className="w-12 px-4 py-2"><input type="checkbox" checked={allSelected} disabled={!deletableRecords.length} onChange={(event) => setSelected((current) => { const next = new Set(current); deletableRecords.forEach((item) => event.target.checked ? next.add(item.id) : next.delete(item.id)); return next; })} aria-label="เลือกประวัติในวันที่นี้ทั้งหมด" /></th>{["เลขที่เอกสาร", "สถานะ", "ยุทโธปกรณ์", "จำนวน", "ต้นทาง", "ปลายทาง", "ผู้ดำเนินการ", "เวลา", "จัดการ"].map((label) => <th key={label} className="px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{records.map((item) => {
        const open = () => onSelect(item);
        const returned = item.movementType === "return";
        const deletable = canDeleteTransaction(item);
        return <tr key={item.id} tabIndex={0} onClick={() => { if (!deletable) return; setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }} onContextMenu={(event) => { event.preventDefault(); open(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); open(); } else if (event.key === " " && deletable) { event.preventDefault(); setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); } }} title={deletable ? "คลิกเพื่อเลือก · คลิกขวาเพื่อเปิดใบเสร็จ" : "คลิกขวาเพื่อเปิดใบเสร็จ"} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none ${selected.has(item.id) ? "bg-red-50/70" : ""}`}><td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(item.id)} disabled={!deletable} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} aria-label={`เลือก ${item.id}`} title={deletable ? "เลือกเพื่อล้างประวัติ" : "รายการนี้ยังยืมค้างอยู่"} /></td><DocumentCell id={item.id} /><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${returned ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{returned ? "คืนแล้ว" : transactionStatus(item.status)}</span></td><td className="max-w-[220px] truncate px-4 py-2.5 font-semibold">{item.equipmentName}</td><td className="px-4 py-2.5">{item.quantity.toLocaleString("th-TH")}</td><td className="max-w-[180px] truncate px-4 py-2.5">{returned ? item.borrower : item.owner}</td><td className="max-w-[180px] truncate px-4 py-2.5">{returned ? item.owner : item.borrower}</td><td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600">{item.operator}</td><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatTime(item.returnDate || item.date)}</td><td className="px-4 py-2"><div className="flex justify-end gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); open(); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold hover:border-blue-400 hover:text-blue-600"><Eye className="size-3.5" />ดูใบเสร็จ</button>{item.activeBorrow ? <button type="button" onClick={(event) => { event.stopPropagation(); onReturn(item); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100" aria-label={`คืน ${item.id}`} title="คืนยุทโธปกรณ์ก่อนลบประวัติ"><RotateCcw className="size-3.5" />คืนก่อนลบ</button> : <button type="button" onClick={(event) => { event.stopPropagation(); onDelete([item.id]); }} className="grid size-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100" aria-label={`ล้างประวัติ ${item.id}`} title="ล้างประวัติรายการนี้"><Trash2 className="size-3.5" /></button>}</div></td></tr>;
      })}</tbody></table></div>;
    }} />
  </div>;
}

function MaintenanceTable({ items, active, onSelect, onStatus, onDispose, emptyText }: { items: AdminMaintenance[]; active: boolean; onSelect: (item: AdminMaintenance) => void; onStatus: (item: AdminMaintenance, status: string) => void; onDispose: (item: AdminMaintenance) => void; emptyText: string }) {
  const groups = useMemo(() => groupRecordsByDate(items, (item) => item.completedAt || item.date), [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return <DatedTableShell groups={groups} collapsed={collapsed} setCollapsed={setCollapsed} emptyText={emptyText} render={(records) => <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="border-y border-slate-200 text-left text-xs text-slate-500"><tr>{["เลขที่เอกสาร", "สถานะ", "ยุทโธปกรณ์", "กองร้อย", "จำนวน", "ผู้แจ้ง", "หมายเหตุ", "เวลา", active ? "จัดการ" : "รายละเอียด"].map((label) => <th key={label} className="px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{records.map((item) => { const open = () => onSelect(item); return <tr key={item.id} tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"><DocumentCell id={item.id} /><td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${["completed", "disposed"].includes(item.status.toLowerCase()) ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>{item.status.toLowerCase() === "completed" && <CheckCircle2 className="size-3.5" />}{maintenanceStatus(item.status)}</span></td><td className="max-w-[220px] truncate px-4 py-2.5 font-semibold">{item.equipmentName}</td><td className="max-w-[180px] truncate px-4 py-2.5">{item.companyName}</td><td className="px-4 py-2.5">{item.quantity.toLocaleString("th-TH")}</td><td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600">{item.operator}</td><td className="max-w-[240px] truncate px-4 py-2.5 text-slate-500">{item.note || "ไม่มีหมายเหตุ"}</td><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatTime(item.completedAt || item.date)}</td><td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{active ? <div className="flex items-center gap-2"><select value={item.status} onChange={(event) => onStatus(item, event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"><option value="Reported">รับแจ้ง</option><option value="Inspecting">กำลังตรวจสอบ</option><option value="Repairing">กำลังซ่อม</option><option value="Completed">ซ่อมเสร็จ</option></select><button type="button" onClick={() => onDispose(item)} className="grid size-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600" title="จำหน่าย"><Trash2 className="size-4" /></button></div> : <button type="button" onClick={open} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:border-blue-400 hover:text-blue-600"><Eye className="size-3.5" />ดูใบเสร็จ</button>}</td></tr>; })}</tbody></table></div>} />;
}

function AuditLogTable({ items, onSelect }: { items: AdminAuditLog[]; onSelect: (item: AdminAuditLog) => void }) {
  const groups = useMemo(() => groupRecordsByDate(items, (item) => item.timestamp), [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return <DatedTableShell groups={groups} collapsed={collapsed} setCollapsed={setCollapsed} emptyText="ไม่พบ Audit Log ตามตัวกรอง" render={(records) => <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="border-y border-slate-200 text-left text-xs text-slate-500"><tr>{["เลขที่ Log", "การดำเนินการ", "ผู้ดำเนินการ", "รายการที่เกี่ยวข้อง", "กองร้อย", "รายละเอียดโดยย่อ", "เวลา"].map((label) => <th key={label} className="px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{records.map((item) => { const open = () => onSelect(item); return <tr key={item.id} tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"><DocumentCell id={item.id} /><td className="px-4 py-2.5"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{auditAction(item.action)}</span></td><td className="max-w-[190px] truncate px-4 py-2.5 font-semibold">{item.user}</td><td className="max-w-[220px] truncate px-4 py-2.5">{item.targetLabel}</td><td className="max-w-[220px] truncate px-4 py-2.5 text-slate-600">{item.companyNames.join(", ") || "ไม่ระบุกองร้อย"}</td><td className="max-w-[280px] truncate px-4 py-2.5 text-slate-500">{item.details || "ไม่มีรายละเอียดเพิ่มเติม"}</td><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatTime(item.timestamp)}</td></tr>; })}</tbody></table></div>} />;
}

function DatedTableShell<T>({ groups, collapsed, setCollapsed, emptyText, render }: { groups: Array<{ key: string; label: string; records: T[] }>; collapsed: Set<string>; setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>; emptyText: string; render: (records: T[]) => React.ReactNode }) {
  if (!groups.length) return <Empty text={emptyText} />;
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{groups.map((group) => { const hidden = collapsed.has(group.key); return <div key={group.key} className="border-b border-slate-200 last:border-b-0"><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"><ChevronDown className={`size-4 transition-transform ${hidden ? "-rotate-90" : ""}`} /><span className="font-semibold">{group.label}</span><span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">{group.records.length} รายการ</span></button>{!hidden && render(group.records)}</div>; })}</div>;
}

function AuditDetailModal({ log, onClose }: { log: AdminAuditLog; onClose: () => void }) {
  return <div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Audit Log</p><h2 className="mt-1 text-xl font-bold">{auditAction(log.action)}</h2><p className="mt-1 text-sm text-slate-500">{format(log.timestamp)}</p></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl border border-slate-200"><X className="size-5" /></button></div><dl className="mt-5 grid gap-3 sm:grid-cols-2"><Detail label="ผู้ดำเนินการ" value={log.user} /><Detail label="รายการที่เกี่ยวข้อง" value={log.targetLabel} /><Detail label="กองร้อยที่เกี่ยวข้อง" value={log.companyNames.join(", ") || "ไม่ระบุกองร้อย"} /><Detail label="รหัสอ้างอิง" value={log.target || "-"} /><Detail label="รหัส Log" value={log.id || "-"} /><Detail label="Action Type" value={log.action || "-"} /></dl><div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">รายละเอียดทั้งหมด</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{log.details || "ไม่มีรายละเอียดเพิ่มเติม"}</p></div><button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-blue-600 font-semibold text-white">ปิด</button></div></div>;
}

function EquipmentSummaryModal({ data, onClose }: { data: AdminData; onClose: () => void }) {
  const rows = data.equipments.map((equipment) => { const stock = data.inventories.filter((item) => item.equipmentId === equipment.id); return { ...equipment, total: stock.reduce((sum, item) => sum + item.total, 0), available: stock.reduce((sum, item) => sum + item.available, 0), borrowed: stock.reduce((sum, item) => sum + item.borrowed, 0), broken: stock.reduce((sum, item) => sum + item.broken, 0) }; }).sort((first, second) => second.total - first.total);
  return <div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-blue-600">ภาพรวมยุทโธปกรณ์</p><h2 className="text-2xl font-bold">จำนวนทั้งหมดแยกตามชนิด</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl border border-slate-200"><X className="size-5" /></button></div><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left"><tr>{["ยุทโธปกรณ์", "หมวดหมู่", "รวม", "พร้อมใช้", "ถูกยืม", "ชำรุด"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3"><span className="flex items-center gap-3"><Image src={item.picture} alt={item.name} width={44} height={44} unoptimized className="size-11 object-contain" /><span className="font-semibold">{item.name}</span></span></td><td className="px-4 py-3 text-slate-600">{item.category}</td><td className="px-4 py-3 font-bold">{item.total.toLocaleString("th-TH")}</td><td className="px-4 py-3 text-emerald-700">{item.available.toLocaleString("th-TH")}</td><td className="px-4 py-3 text-amber-700">{item.borrowed.toLocaleString("th-TH")}</td><td className="px-4 py-3 text-red-700">{item.broken.toLocaleString("th-TH")}</td></tr>)}</tbody></table></div></div></div>;
}

function BorrowedSummaryModal({ data, onClose, onSelect, onReturn }: { data: AdminData; onClose: () => void; onSelect: (item: AdminTransaction) => void; onReturn: (item: AdminTransaction) => void }) {
  const [companyId, setCompanyId] = useState("");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());
  const keyword = query.trim().toLocaleLowerCase("th");
  const active = data.transactions
    .filter((item) => item.activeBorrow)
    .filter((item) => !companyId || item.ownerCompanyId === companyId || item.borrowerCompanyId === companyId)
    .filter((item) => !date || localDateKey(item.date) === date)
    .filter((item) => !keyword || `${item.id} ${item.equipmentName} ${item.operator} ${item.owner} ${item.borrower} ${item.note}`.toLocaleLowerCase("th").includes(keyword))
    .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());
  const groups = [...active.reduce((result, item) => { const records = result.get(item.borrower) || []; records.push(item); result.set(item.borrower, records); return result; }, new Map<string, AdminTransaction[]>())];
  return <div className="popup-backdrop fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel max-h-[92dvh] w-full max-w-6xl overflow-y-auto rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">รายการเคลื่อนไหวปัจจุบัน</p><h2 className="text-2xl font-bold">ยุทโธปกรณ์ที่กำลังถูกยืม</h2><p className="mt-1 text-sm text-slate-500">พบ {active.length.toLocaleString("th-TH")} รายการ แยกตามกองร้อยที่กำลังถือครอง</p></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl border border-slate-200"><X className="size-5" /></button></div><div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_190px]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหายุทโธปกรณ์ ผู้เบิก หรือเลขที่เอกสาร" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm outline-none focus:border-blue-500" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg hover:bg-slate-100"><X className="size-4" /></button>}</label><CompanyFilter value={companyId} onChange={setCompanyId} companies={data.companies} /><DateFilter value={date} onChange={setDate} /></div>{groups.length ? <div className="mt-5 space-y-4">{groups.map(([companyName, records]) => { const hidden = collapsedCompanies.has(companyName); return <section key={companyName} className="overflow-hidden rounded-xl border border-slate-200"><button type="button" onClick={() => setCollapsedCompanies((current) => { const next = new Set(current); if (next.has(companyName)) next.delete(companyName); else next.add(companyName); return next; })} className="flex w-full items-center gap-2 bg-blue-50 px-4 py-3 text-left font-bold text-blue-800"><ChevronDown className={`size-4 transition-transform ${hidden ? "-rotate-90" : ""}`} /><Building2 className="size-4" />{companyName}<span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">{records.length} รายการ</span></button>{!hidden && <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{["สถานะ", "ยุทโธปกรณ์", "จำนวน", "ผู้เบิก", "ต้นทาง", "วันที่เบิก", "กำหนดคืน", "จัดการ"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{records.map((item) => <tr key={item.id} onClick={() => onSelect(item)} className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50"><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status.toLowerCase() === "overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{transactionStatus(item.status)}</span></td><td className="max-w-[220px] truncate px-4 py-3 font-bold">{item.equipmentName}</td><td className="px-4 py-3">{item.quantity.toLocaleString("th-TH")}</td><td className="max-w-[190px] truncate px-4 py-3">{item.operator}</td><td className="max-w-[180px] truncate px-4 py-3">{item.owner}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{format(item.date)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{format(item.dueDate)}</td><td className="px-4 py-2"><div className="flex gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); onSelect(item); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">ดูใบเสร็จ</button><button type="button" onClick={(event) => { event.stopPropagation(); onReturn(item); }} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700">คืนยุทโธปกรณ์</button></div></td></tr>)}</tbody></table></div>}</section>; })}</div> : <div className="mt-5"><Empty text="ไม่พบรายการที่กำลังถูกยืมตามตัวกรอง" /></div>}</div></div>;
}

function ConfirmDisposeModal({ item, onClose, onConfirm }: { item: AdminMaintenance; onClose: () => void; onConfirm: () => void }) { return <div className="popup-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[24px] bg-white p-5"><span className="grid size-12 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-6" /></span><h2 className="mt-4 text-xl font-bold">ยืนยันการจำหน่ายยุทโธปกรณ์</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.equipmentName} จำนวน {item.quantity.toLocaleString("th-TH")} รายการ จะถูกตัดออกจากยอดรวมและยอดชำรุดของ {item.companyName} การดำเนินการนี้ย้อนกลับไม่ได้</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 font-semibold">ยกเลิก</button><button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-red-600 font-semibold text-white">ยืนยันจำหน่าย</button></div></div></div>; }

function ConfirmHistoryDeleteModal({ request, onClose, onConfirm }: { request: { ids: string[]; all: boolean; count: number }; onClose: () => void; onConfirm: () => void }) {
  return <div className="popup-backdrop fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[24px] bg-white p-5"><span className="grid size-12 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-6" /></span><h2 className="mt-4 text-xl font-bold">{request.all ? "ล้างประวัติเบิกคืนทั้งหมด" : "ล้างประวัติที่เลือก"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">ระบบจะลบข้อมูลจากชีต Transactions จำนวน {request.count.toLocaleString("th-TH")} รายการอย่างถาวรและไม่สามารถกู้คืนได้ รายการที่ยังยืมค้างหรือเกินกำหนดจะไม่ถูกลบเพื่อรักษาความถูกต้องของคลัง</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 font-semibold">ยกเลิก</button><button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-red-600 font-semibold text-white">ยืนยันล้างประวัติ</button></div></div></div>;
}

function ConfirmInventoryDeleteModal({ item, onClose, onConfirm }: { item: AdminData["inventories"][number]; onClose: () => void; onConfirm: () => void }) { return <div className="popup-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[24px] bg-white p-5"><span className="grid size-12 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-6" /></span><h2 className="mt-4 text-xl font-bold">ยืนยันลบรายการออกจากคลัง</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.equipmentName}{item.plateNumber ? ` (${item.plateNumber})` : ""} จาก {item.companyName} จะถูกลบถาวร ระบบไม่อนุญาตให้ลบหากยังมีรายการถูกยืมหรือชำรุดอยู่</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 font-semibold">ยกเลิก</button><button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-red-600 font-semibold text-white">ยืนยันลบ</button></div></div></div>; }

function ConfirmTransactionReturnModal({ item, onClose, onConfirm }: { item: AdminTransaction; onClose: () => void; onConfirm: () => void }) { const selfUse = item.ownerCompanyId === item.borrowerCompanyId; return <div className="popup-backdrop fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[24px] bg-white p-5"><span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ArrowRightLeft className="size-6" /></span><h2 className="mt-4 text-xl font-bold">ยืนยันคืนยุทโธปกรณ์</h2><p className="mt-2 text-sm leading-6 text-slate-600">คืน {item.equipmentName} จำนวน {item.outstandingQuantity.toLocaleString("th-TH")} รายการ {selfUse ? `กลับเข้าคลัง ${item.owner}` : `จาก ${item.borrower} ไปยัง ${item.owner}`} และปิดรายการยืมนี้ทันที</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 font-semibold">ยกเลิก</button><button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-emerald-600 font-semibold text-white">ยืนยันการคืน</button></div></div></div>; }

function DeleteCompanyModal({ company, onClose, onConfirm }: { company: AdminData["companies"][number]; onClose: () => void; onConfirm: (password: string, confirmName: string) => void }) {
  const [step, setStep] = useState(1);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const blocked = company.users > 0 || company.total > 0 || company.borrowed > 0;
  return <div className="popup-backdrop fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[28px] bg-white p-5"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-6" /></span><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-slate-100"><X className="size-5" /></button></div><p className="mt-4 text-xs font-bold tracking-wider text-red-600">ขั้นตอน {step} จาก 3</p><h2 className="mt-1 text-xl font-bold">ลบกองร้อย {company.name}</h2>{step === 1 && <><p className="mt-3 text-sm leading-6 text-slate-600">การลบจะนำกองร้อยออกจากเมนูและรายการเลือกทั้งหมด แต่ยังรักษาชื่อไว้ในประวัติเก่า ระบบจะอนุญาตเฉพาะกองร้อยที่ไม่มีผู้ใช้ ไม่มีของในคลัง และไม่มีรายการยืมค้าง</p><div className={`mt-4 rounded-xl border p-3 text-sm ${blocked ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{blocked ? `ยังลบไม่ได้ · ผู้ใช้ ${company.users} คน · ยุทโธปกรณ์ ${company.total.toLocaleString("th-TH")} · กำลังยืม ${company.borrowed.toLocaleString("th-TH")}` : "กองร้อยผ่านการตรวจสอบเบื้องต้น สามารถดำเนินการยืนยันต่อได้"}</div></>}{step === 2 && <label className="mt-5 block"><span className="mb-2 block text-sm font-semibold">พิมพ์ชื่อกองร้อยให้ตรงกัน</span><input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} placeholder={company.name} autoFocus className="h-12 w-full rounded-xl border border-red-200 px-3 outline-none focus:border-red-500" /></label>}{step === 3 && <label className="mt-5 block"><span className="mb-2 block text-sm font-semibold">รหัสผ่าน Admin</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="กรอกรหัสผ่านบัญชีที่กำลังใช้งาน" autoFocus className="h-12 w-full rounded-xl border border-red-200 px-3 outline-none focus:border-red-500" /></label>}<div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => step === 1 ? onClose() : setStep((current) => current - 1)} className="h-11 rounded-xl bg-slate-100 font-semibold">{step === 1 ? "ยกเลิก" : "ย้อนกลับ"}</button>{step < 3 ? <button type="button" disabled={blocked || (step === 2 && confirmName !== company.name)} onClick={() => setStep((current) => current + 1)} className="h-11 rounded-xl bg-red-600 font-semibold text-white disabled:opacity-40">ดำเนินการต่อ</button> : <button type="button" disabled={!password} onClick={() => onConfirm(password, confirmName)} className="h-11 rounded-xl bg-red-600 font-semibold text-white disabled:opacity-40">ยืนยันลบถาวร</button>}</div></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>; }

function groupRecordsByDate<T>(items: T[], getDate: (item: T) => string) {
  const groups = new Map<string, T[]>();
  [...items].sort((first, second) => new Date(getDate(second)).getTime() - new Date(getDate(first)).getTime()).forEach((item) => { const date = new Date(getDate(item)); const key = Number.isNaN(date.getTime()) ? "unknown" : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; const records = groups.get(key) || []; records.push(item); groups.set(key, records); });
  return [...groups].map(([key, records]) => ({ key, label: key === "unknown" ? "ไม่ระบุวันที่" : new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date(getDate(records[0]))), records }));
}

function maintenanceStatus(status: string) { return ({ reported: "แจ้งเสีย", inspecting: "กำลังตรวจสอบ", repairing: "กำลังดำเนินการ", completed: "ซ่อมเสร็จแล้ว", disposed: "จำหน่ายแล้ว" } as Record<string, string>)[status.toLowerCase()] || status; }
function auditAction(action: string) { const key = action.toLowerCase().replace(/-/g, "_").replace(/^admin_/, ""); return ({ borrow: "เบิกยุทโธปกรณ์", return: "คืนยุทโธปกรณ์", return_transaction: "คืนยุทโธปกรณ์", delete_transaction_history: "ล้างประวัติเบิก / คืน", defect: "แจ้งยุทโธปกรณ์ชำรุด", report_defect: "แจ้งยุทโธปกรณ์ชำรุด", maintenance_status: "อัปเดตสถานะซ่อม", dispose_maintenance: "จำหน่ายยุทโธปกรณ์", transfer_inventory: "เคลื่อนย้ายยุทโธปกรณ์", save_user: "จัดการผู้ใช้งาน", delete_user: "ลบผู้ใช้งาน", delete_company: "ลบกองร้อย", save_equipment: "จัดการบัญชียุทโธปกรณ์", save_category: "จัดการหมวดหมู่ยุทโธปกรณ์", delete_equipment: "ลบชนิดยุทโธปกรณ์", delete_equipment_category: "ลบหมวดหมู่ยุทโธปกรณ์", save_inventory: "ปรับปรุงคลัง", batch_adjust_inventory: "ปรับจำนวนยุทโธปกรณ์หลายรายการ", add_inventory: "เพิ่มรายการเข้าคลัง", batch_add_inventory: "เพิ่มยุทโธปกรณ์หลายรายการเข้าคลัง", delete_inventory: "ลบรายการออกจากคลัง", save_company: "จัดการกองร้อย" } as Record<string, string>)[key] || action || "ไม่ระบุการดำเนินการ"; }
function companyIcon(name: string) { const normalized = name.toLocaleLowerCase("th"); if (normalized.includes("ต่อสู้อากาศ")) return Shield; if (normalized.includes("สนับสนุน")) return LifeBuoy; if (normalized.includes("อากาศยาน")) return Plane; if (normalized.includes("รักษาการณ์")) return ShieldCheck; if (normalized.includes("ฝึก") || normalized.includes("ทหารใหม่")) return GraduationCap; return Building2; }

function EditModal({ modal, data, onClose, onSave }: { modal: NonNullable<Modal>; data: AdminData; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const originalItem = modal.item || {};
  const draftKey = `tems-admin-form:${modal.type}:${String(originalItem.id || "new")}`;
  const [restoredDraft] = useState<Record<string, string>>(() => {
    try { return JSON.parse(window.sessionStorage.getItem(draftKey) || "{}"); } catch { return {}; }
  });
  const item = { ...originalItem, ...restoredDraft };
  const [dirty, setDirty] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(restoredDraft);
  const { clearDraft, confirmDiscard } = useUnsavedDraft({ storageKey: draftKey, value: draftValues, dirty, onRestore: setDraftValues });
  const close = () => { if (confirmDiscard()) onClose(); };
  usePopupDismiss(true, close);
  const captureDraft = (form: HTMLFormElement) => { setDirty(true); window.queueMicrotask(() => setDraftValues(Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)])))); };
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); clearDraft(); onSave(Object.fromEntries(new FormData(event.currentTarget).entries())); };
  const action = modal.type === "transfer" ? "transfer-inventory" : modal.type === "inventory-add" ? "add-inventory" : `save-${modal.type}`;
  return <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form onSubmit={submit} onInputCapture={(event) => captureDraft(event.currentTarget)} onChangeCapture={(event) => captureDraft(event.currentTarget)} onClickCapture={(event) => { if ((event.target as Element).closest('[role="option"], [data-form-value]')) captureDraft(event.currentTarget); }} className="popup-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Admin Action</p><h2 className="text-xl font-bold">{modal.type === "transfer" ? "เคลื่อนย้ายยุทโธปกรณ์ระหว่างกองร้อย" : modal.type === "inventory-add" ? "เพิ่มรายการเข้าคลัง" : modal.type === "inventory" ? "จัดการอาวุธในคลัง" : modal.type === "category" ? (item.id ? "แก้ไขหมวดหมู่ยุทโธปกรณ์" : "เพิ่มหมวดหมู่ยุทโธปกรณ์") : modal.type === "equipment" ? (item.id ? "แก้ไขยุทโธปกรณ์" : "เพิ่มยุทโธปกรณ์") : "จัดการข้อมูล"}</h2></div><button type="button" onClick={close}><X /></button></div><input type="hidden" name="action" value={action} />{!["inventory", "inventory-add", "transfer"].includes(modal.type) && <input type="hidden" name="id" value={String(item.id || "")} />}<div className="mt-5 grid gap-4 sm:grid-cols-2">
    {modal.type === "company" && <Input name="name" label="ชื่อกองร้อย" value={item.name} />}
    {modal.type === "user" && <><Select name="companyId" label="กองร้อย" value={item.companyId} options={data.companies.map((company) => [company.id, company.name])} /><Select name="role" label="สิทธิ์" value={item.role || "User"} options={[["User", "User"], ["Admin", "Admin"]]} /><Input name="rank" label="ยศ" value={item.rank} /><Input name="firstName" label="ชื่อ" value={item.firstName} /><Input name="lastName" label="นามสกุล" value={item.lastName} /><Input name="email" label="อีเมลเข้าสู่ระบบ" value={item.email} type="email" /><Input name="phone" label="เบอร์โทร" value={item.phone} optional /><Input name="gmail" label="Gmail กู้คืน" value={item.gmail} type="email" optional /><Input name="password" label={item.id ? "รหัสผ่านใหม่ (เว้นว่างได้)" : "รหัสผ่านเริ่มต้น"} type="password" optional={Boolean(item.id)} /></>}
    {modal.type === "equipment" && <EquipmentEditor item={item} categories={data.categories} />}
    {modal.type === "category" && <CategoryEditor item={item} />}
    {modal.type === "inventory" && <InventoryEditor data={data} initialCompanyId={String(item.companyId || "")} initialInventoryId={String(item.id || "")} />}
    {modal.type === "inventory-add" && <InventoryAddEditor data={data} initialCompanyId={String(item.companyId || "")} />}
    {modal.type === "transfer" && <TransferEditor data={data} />}
  </div>{modal.type === "user" && Boolean(item.id) && <button type="button" onClick={() => { if (window.confirm(`ยืนยันลบผู้ใช้งาน ${String(item.firstName || "")} ${String(item.lastName || "")}?`)) onSave({ action: "delete-user", id: item.id }); }} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 font-bold text-red-700 transition hover:bg-red-100"><Trash2 className="size-4" />ลบผู้ใช้งาน</button>}{modal.type === "equipment" && Boolean(item.id) && <button type="button" onClick={() => { if (window.confirm(`ยืนยันลบยุทโธปกรณ์ ${String(item.name || "")}?`)) onSave({ action: "delete-equipment", id: item.id }); }} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 font-bold text-red-700 transition hover:bg-red-100"><Trash2 className="size-4" />ลบชนิดยุทโธปกรณ์</button>}<button className={`${(["user", "equipment"].includes(modal.type) && Boolean(item.id)) ? "mt-3" : "mt-6"} h-12 w-full rounded-full bg-blue-600 font-bold text-white`}>ยืนยันและบันทึก Audit Log</button></form></div>;
}

function RifleIcon({ className = "size-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M3 9h9l3-2h4l2 2-2 2-4-1-3 2H8l-2 6H4l1-6H3Z" /><path d="M12 9V6h2v2" /><path d="M8 12l2 3" /></svg>;
}

const categoryIconOptions = [
  { name: "Rifle", label: "ปืน", Icon: RifleIcon },
  { name: "Boxes", label: "กล่องยุทโธปกรณ์", Icon: Boxes },
  { name: "Package", label: "พัสดุ", Icon: Package },
  { name: "Crosshair", label: "เป้า/อาวุธ", Icon: Crosshair },
  { name: "Target", label: "เป้าหมาย", Icon: Target },
  { name: "Sword", label: "อาวุธ", Icon: Sword },
  { name: "Bomb", label: "วัตถุระเบิด", Icon: Bomb },
  { name: "CircleDot", label: "กระสุน", Icon: CircleDot },
  { name: "Shield", label: "โล่/ป้องกัน", Icon: Shield },
  { name: "HardHat", label: "หมวกป้องกัน", Icon: HardHat },
  { name: "Shirt", label: "เครื่องแต่งกาย", Icon: Shirt },
  { name: "Backpack", label: "สัมภาระ", Icon: Backpack },
  { name: "Truck", label: "ยานพาหนะ", Icon: Truck },
  { name: "Ambulance", label: "รถพยาบาล", Icon: Ambulance },
  { name: "Fuel", label: "เชื้อเพลิง", Icon: Fuel },
  { name: "Plane", label: "อากาศยาน", Icon: Plane },
  { name: "Wrench", label: "เครื่องมือ", Icon: Wrench },
  { name: "Hammer", label: "งานช่าง", Icon: Hammer },
  { name: "Cog", label: "เครื่องจักร", Icon: Cog },
  { name: "Database", label: "คลัง", Icon: Database },
  { name: "ClipboardList", label: "รายการ", Icon: ClipboardList },
  { name: "LifeBuoy", label: "สนับสนุน", Icon: LifeBuoy },
  { name: "GraduationCap", label: "ฝึกศึกษา", Icon: GraduationCap },
  { name: "Radio", label: "วิทยุสื่อสาร", Icon: Radio },
  { name: "Radar", label: "เรดาร์", Icon: Radar },
  { name: "SatelliteDish", label: "ดาวเทียม", Icon: SatelliteDish },
  { name: "BellRing", label: "สัญญาณเตือน", Icon: BellRing },
  { name: "Siren", label: "ไซเรน", Icon: Siren },
  { name: "Binoculars", label: "ตรวจการณ์", Icon: Binoculars },
  { name: "Camera", label: "กล้อง", Icon: Camera },
  { name: "Compass", label: "นำทาง", Icon: Compass },
  { name: "Map", label: "แผนที่", Icon: MapIcon },
  { name: "Cpu", label: "อิเล็กทรอนิกส์", Icon: Cpu },
  { name: "BatteryCharging", label: "พลังงาน", Icon: BatteryCharging },
  { name: "Cable", label: "สายและอุปกรณ์", Icon: Cable },
  { name: "Zap", label: "ไฟฟ้า", Icon: Zap },
  { name: "Flame", label: "เชื้อเพลิง/เพลิง", Icon: Flame },
  { name: "TentTree", label: "สนาม/ที่พัก", Icon: TentTree },
  { name: "Utensils", label: "อาหาร", Icon: Utensils },
  { name: "BowArrow", label: "ธนู", Icon: BowArrow },
  { name: "Swords", label: "อาวุธประชิด", Icon: Swords },
  { name: "Axe", label: "ขวาน", Icon: Axe },
  { name: "Shell", label: "เปลือก/กระสุน", Icon: Shell },
  { name: "Telescope", label: "กล้องส่องทางไกล", Icon: Telescope },
  { name: "Drone", label: "โดรน", Icon: Drone },
  { name: "Rocket", label: "จรวด", Icon: Rocket },
  { name: "TowerControl", label: "ควบคุมการบิน", Icon: TowerControl },
  { name: "RadioTower", label: "หอสื่อสาร", Icon: RadioTower },
  { name: "Ship", label: "เรือ", Icon: Ship },
  { name: "Anchor", label: "งานทางน้ำ", Icon: Anchor },
  { name: "Warehouse", label: "อาคารคลัง", Icon: Warehouse },
  { name: "BriefcaseMedical", label: "เวชภัณฑ์", Icon: BriefcaseMedical },
  { name: "Biohazard", label: "สารอันตราย", Icon: Biohazard },
  { name: "Flag", label: "หน่วย/ธง", Icon: Flag },
  { name: "Medal", label: "เครื่องหมาย", Icon: Medal },
];

function CategoryIconPreview({ name, className = "size-5" }: { name: string; className?: string }) {
  const Icon = categoryIconOptions.find((item) => item.name === name)?.Icon || Boxes;
  return <Icon className={className} />;
}

function CategoryManagerModal({ categories, equipments, onClose, onAdd, onEdit, onDelete }: { categories: AdminData["categories"]; equipments: AdminData["equipments"]; onClose: () => void; onAdd: () => void; onEdit: (item: AdminData["categories"][number]) => void; onDelete: (name: string) => void }) {
  return <div className="popup-backdrop fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[30px] bg-slate-50 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Equipment Categories</p><h2 className="mt-1 text-xl font-bold">เพิ่ม/จัดการหมวดหมู่</h2><p className="mt-1 text-sm text-slate-500">เพิ่มหมวดหมู่ใหม่ หรือเลือกหมวดหมู่เดิมเพื่อแก้ชื่อและไอคอน</p></div><button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 transition hover:bg-slate-200"><X className="size-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><button type="button" onClick={onAdd} className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50 font-bold text-cyan-800 transition hover:bg-cyan-100 active:scale-[0.99]"><Plus className="size-5" />เพิ่มหมวดหมู่ใหม่</button><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => { const count = equipments.filter((item) => item.category === category.name).length; return <div key={category.name} className="group flex items-center gap-3 rounded-2xl border border-cyan-200 bg-white p-3 shadow-sm transition hover:border-cyan-400 hover:shadow-md"><button type="button" onClick={() => onEdit(category)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-700 transition group-hover:bg-cyan-600 group-hover:text-white"><CategoryIconPreview name={category.icon} /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{category.name}</span><span className="mt-0.5 block text-xs text-slate-500">{count.toLocaleString("th-TH")} ชนิดยุทโธปกรณ์</span></span><Settings className="size-4 shrink-0 text-blue-500" /></button><button type="button" onClick={() => onDelete(category.name)} className="grid size-9 shrink-0 place-items-center rounded-lg text-red-500 transition hover:bg-red-50" aria-label={`ลบหมวดหมู่ ${category.name}`}><Trash2 className="size-4" /></button></div>; })}</div>{!categories.length && <Empty text="ยังไม่มีหมวดหมู่ยุทโธปกรณ์" />}</div></div></div>;
}

function EquipmentCatalog({ items, onAdd, onManageCategories, onEdit }: { items: AdminData["equipments"]; onAdd: () => void; onManageCategories: () => void; onEdit: (item: AdminData["equipments"][number]) => void }) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((first, second) => first.localeCompare(second, "th"));
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : "";
  const filteredItems = activeCategory ? items.filter((item) => item.category === activeCategory) : items;
  const categoryOptions: CompactSelectOption[] = [{ value: "", label: "แสดงทั้งหมด", description: `${items.length.toLocaleString("th-TH")} ชนิดยุทโธปกรณ์` }, ...categories.map((category) => ({ value: category, label: category, description: `${items.filter((item) => item.category === category).length.toLocaleString("th-TH")} ชนิดยุทโธปกรณ์` }))];
  return <div><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:items-center"><button type="button" onClick={onAdd} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] lg:w-auto"><PackagePlus className="size-4" />เพิ่มยุทโธปกรณ์</button><button type="button" onClick={onManageCategories} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-sm font-bold text-cyan-800 transition hover:bg-cyan-100 active:scale-[0.99] lg:w-auto"><Settings className="size-4" />เพิ่ม/จัดการหมวดหมู่</button><div className="min-w-0 sm:col-span-2 lg:ml-auto lg:w-80"><CompactSelect value={activeCategory} onChange={setSelectedCategory} options={categoryOptions} searchable placeholder="เลือกหมวดหมู่ยุทโธปกรณ์" /></div></div><p className="mb-3 text-xs text-slate-500 sm:text-sm">แสดง {filteredItems.length.toLocaleString("th-TH")} จาก {items.length.toLocaleString("th-TH")} ชนิด</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filteredItems.map((item) => <button key={item.id} type="button" onClick={() => onEdit(item)} className="flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-md transition hover:border-blue-300 active:scale-[0.99] sm:gap-4 sm:p-4"><span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 p-1 sm:size-16"><Image src={item.picture} alt={item.name} width={96} height={96} unoptimized className="size-full object-contain" /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{item.name}</span><span className="mt-1 block truncate text-sm text-blue-600">{item.category}</span><span className="mt-2 block truncate text-xs text-slate-500">{item.requirePlate ? "แยกรายคัน/ทะเบียน" : "นับตามจำนวน"}</span></span></button>)}</div>{!filteredItems.length && <Empty text="ไม่พบยุทโธปกรณ์ในหมวดหมู่นี้" />}</div>;
}

function ConfirmCategoryDeleteModal({ category, count, onClose, onConfirm }: { category: string; count: number; onClose: () => void; onConfirm: () => void }) {
  return <div className="popup-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="popup-panel w-full max-w-md rounded-[24px] bg-white p-5"><span className="grid size-12 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-6" /></span><h2 className="mt-4 text-xl font-bold">ลบหมวดหมู่ “{category}”</h2><p className="mt-2 text-sm leading-6 text-slate-600">ยุทโธปกรณ์ {count.toLocaleString("th-TH")} ชนิดในหมวดนี้จะถูกซ่อนจากระบบ แต่ประวัติเดิมจะยังคงอยู่ ระบบจะไม่อนุญาตถ้ายังมียอดอยู่ในคลัง</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 font-semibold">ยกเลิก</button><button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-red-600 font-semibold text-white">ยืนยันลบหมวดหมู่</button></div></div></div>;
}

function BatchInventoryModal({ items, onClose, onConfirm }: { items: AdminData["inventories"]; onClose: () => void; onConfirm: (items: Array<{ id: string; total: number; plateNumber: string }>) => void }) {
  const [totals, setTotals] = useState<Record<string, number>>(() => Object.fromEntries(items.map((item) => [item.id, item.total])));
  const [plateNumbers, setPlateNumbers] = useState<Record<string, string>>(() => Object.fromEntries(items.map((item) => [item.id, item.plateNumber])));
  const update = (item: AdminData["inventories"][number], nextValue: number) => {
    const minimum = Math.max(1, item.borrowed + item.broken);
    const total = item.requirePlate ? 1 : Math.max(minimum, Math.floor(nextValue || minimum));
    setTotals((current) => ({ ...current, [item.id]: total }));
  };
  const changed = items.filter((item) => totals[item.id] !== item.total || (item.requirePlate && plateNumbers[item.id]?.trim() !== item.plateNumber));
  const { clearDraft, confirmDiscard } = useUnsavedDraft({ storageKey: `tems-admin-batch-edit:${items.map((item) => item.id).sort().join(",")}`, value: { totals, plateNumbers }, dirty: changed.length > 0, onRestore: (draft) => { setTotals(draft.totals || {}); setPlateNumbers(draft.plateNumbers || {}); } });
  const close = () => { if (confirmDiscard()) onClose(); };
  usePopupDismiss(true, close);
  return <div className="popup-backdrop fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="popup-panel flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[30px] bg-white sm:rounded-[30px]"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Batch Inventory</p><h2 className="mt-1 text-xl font-bold">ปรับจำนวนและ Serial หลายรายการ</h2><p className="mt-1 text-sm text-slate-500">เลือกไว้ {items.length.toLocaleString("th-TH")} รายการ · มีการเปลี่ยนแปลง {changed.length.toLocaleString("th-TH")} รายการ</p></div><button type="button" onClick={close} className="grid size-10 place-items-center rounded-xl bg-slate-100"><X className="size-5" /></button></div><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">{items.map((item) => { const minimum = Math.max(1, item.borrowed + item.broken); const total = totals[item.id] ?? item.total; return <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_260px]"><div className="flex min-w-0 items-center gap-3"><span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 p-1"><Image src={item.picture} alt={item.equipmentName} width={56} height={56} unoptimized className="size-full object-contain" /></span><span className="min-w-0"><span className="block truncate font-bold">{item.equipmentName}</span><span className="mt-1 block text-xs text-slate-500">{item.companyName}{item.plateNumber ? ` · Serial ${item.plateNumber}` : ""}</span><span className="mt-1 block text-xs text-slate-500">เดิม {item.total.toLocaleString("th-TH")} · ยืม {item.borrowed.toLocaleString("th-TH")} · ชำรุด {item.broken.toLocaleString("th-TH")}</span></span></div><div>{item.requirePlate ? <label><span className="mb-1 block text-xs font-semibold text-slate-500">Serial/ทะเบียนใหม่</span><input value={plateNumbers[item.id] ?? item.plateNumber} disabled={item.borrowed > 0} onChange={(event) => setPlateNumbers((current) => ({ ...current, [item.id]: event.target.value }))} className="h-10 w-full rounded-xl border border-violet-200 px-3 font-mono disabled:bg-slate-100" />{item.borrowed > 0 && <span className="mt-1 block text-[11px] text-amber-600">กำลังถูกยืม จึงยังแก้ Serial ไม่ได้</span>}</label> : <><span className="mb-1 block text-xs font-semibold text-slate-500">จำนวนรวมใหม่</span><div className="flex items-center gap-2"><button type="button" disabled={total <= minimum} onClick={() => update(item, total - 1)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white disabled:opacity-30"><Minus className="size-4" /></button><input type="number" value={total} min={minimum} onChange={(event) => update(item, Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-center font-bold" /><button type="button" onClick={() => update(item, total + 1)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white"><Plus className="size-4" /></button></div>{minimum > 1 && <span className="mt-1 block text-[11px] text-amber-600">ลดได้ต่ำสุด {minimum} เพราะมียอดยืมหรือชำรุด</span>}</>}</div></div>; })}</div><div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-white p-4 sm:p-5"><button type="button" onClick={close} className="h-12 rounded-xl bg-slate-100 font-bold text-slate-600">ยกเลิก</button><button type="button" disabled={!changed.length} onClick={() => { clearDraft(); onConfirm(items.map((item) => ({ id: item.id, total: totals[item.id] ?? item.total, plateNumber: plateNumbers[item.id] ?? item.plateNumber }))); }} className="h-12 rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40">ยืนยันปรับ {changed.length} รายการ</button></div></div></div>;
}

type InventoryBatchAddRow = { key: string; companyId: string; equipmentId: string; total: string; plateNumber: string };

function InventoryBatchAddModal({ data, initialCompanyId, onClose, onConfirm }: { data: AdminData; initialCompanyId: string; onClose: () => void; onConfirm: (items: Array<{ companyId: string; equipmentId: string; total: number; plateNumber: string }>) => void }) {
  const createRow = (): InventoryBatchAddRow => ({ key: crypto.randomUUID(), companyId: initialCompanyId || data.companies[0]?.id || "", equipmentId: data.equipments[0]?.id || "", total: "1", plateNumber: "" });
  const [rows, setRows] = useState<InventoryBatchAddRow[]>(() => [createRow()]);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const { clearDraft, confirmDiscard } = useUnsavedDraft({ storageKey: "tems-admin-batch-add", value: { rows }, dirty: touched, onRestore: (draft) => { if (draft.rows?.length) { setRows(draft.rows); setTouched(true); } } });
  const close = () => { if (confirmDiscard()) onClose(); };
  usePopupDismiss(true, close);
  const companyOptions = data.companies.map((company) => ({ value: company.id, label: company.name }));
  const equipmentOptions = data.equipments.map((equipment) => ({ value: equipment.id, label: equipment.name, description: equipment.category, image: equipment.picture }));
  const updateRow = (key: string, patch: Partial<InventoryBatchAddRow>) => { setTouched(true); setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row)); };
  const submit = () => {
    const normalized = rows.map((row) => ({ companyId: row.companyId, equipmentId: row.equipmentId, total: Math.floor(Number(row.total)), plateNumber: row.plateNumber.trim() }));
    const invalid = normalized.find((row) => {
      const equipment = data.equipments.find((item) => item.id === row.equipmentId);
      return !row.companyId || !equipment || !Number.isInteger(row.total) || row.total < 1 || (equipment.requirePlate && (!row.plateNumber || row.total !== 1));
    });
    if (invalid) return setError("กรุณากรอกกองร้อย ชนิด จำนวน และ Serial/ทะเบียนของทุกรายการให้ครบถ้วน");
    const serialKeys = normalized.map((row) => {
      const equipment = data.equipments.find((item) => item.id === row.equipmentId);
      return equipment?.requirePlate ? `${row.equipmentId}:${row.plateNumber.toLowerCase()}` : "";
    }).filter(Boolean);
    if (new Set(serialKeys).size !== serialKeys.length) return setError("พบ Serial/ทะเบียนซ้ำกันในรายการที่กำลังเพิ่ม");
    clearDraft();
    onConfirm(normalized);
  };
  return <div className="popup-backdrop fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="popup-panel flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[30px] bg-white sm:rounded-[30px]"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Batch Inventory</p><h2 className="mt-1 text-xl font-bold">เพิ่มยุทโธปกรณ์หลายรายการเข้าหลายกองร้อย</h2><p className="mt-1 text-sm text-slate-500">เพิ่ม คัดลอก และย่อแต่ละแถวได้ ระบบจะเก็บฉบับร่างไว้จนกว่าจะปิดแท็บ</p></div><button type="button" onClick={close} className="grid size-10 place-items-center rounded-xl bg-slate-100"><X className="size-5" /></button></div><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">{rows.map((row, index) => { const equipment = data.equipments.find((item) => item.id === row.equipmentId); const isCollapsed = collapsed.has(row.key); return <section key={row.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`${isCollapsed ? "" : "mb-3"} flex items-center justify-between gap-3`}><button type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })} className="flex min-w-0 flex-1 items-center gap-2 text-left"><ChevronDown className={`size-4 shrink-0 transition ${isCollapsed ? "-rotate-90" : ""}`} /><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-sm font-black text-blue-700">{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{equipment?.name || "รายการเข้าคลัง"}</span><span className="block truncate text-xs text-slate-500">{data.companies.find((item) => item.id === row.companyId)?.name || "ยังไม่เลือกกองร้อย"}{row.plateNumber ? ` · ${row.plateNumber}` : ""}</span></span></button><div className="flex shrink-0"><button type="button" onClick={() => { const copy = { ...row, key: crypto.randomUUID(), plateNumber: equipment?.requirePlate ? "" : row.plateNumber }; setTouched(true); setRows((current) => { const position = current.findIndex((item) => item.key === row.key); const next = [...current]; next.splice(position + 1, 0, copy); return next; }); }} className="grid size-9 place-items-center rounded-lg text-blue-600 transition hover:bg-blue-50" aria-label="คัดลอกแถว"><Copy className="size-4" /></button><button type="button" disabled={rows.length === 1} onClick={() => { setTouched(true); setRows((current) => current.filter((item) => item.key !== row.key)); }} className="grid size-9 place-items-center rounded-lg text-red-500 transition hover:bg-red-50 disabled:opacity-30" aria-label="ลบแถว"><Trash2 className="size-4" /></button></div></div>{!isCollapsed && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_150px_1fr]"><SelectControl label="กองร้อย" value={row.companyId} onChange={(companyId) => updateRow(row.key, { companyId })} options={companyOptions} /><SelectControl label="ชนิดยุทโธปกรณ์" value={row.equipmentId} onChange={(equipmentId) => { const next = data.equipments.find((item) => item.id === equipmentId); updateRow(row.key, { equipmentId, total: next?.requirePlate ? "1" : row.total || "1", plateNumber: next?.requirePlate ? row.plateNumber : "" }); }} options={equipmentOptions} /><label><span className="mb-1 block text-sm font-semibold">จำนวน</span><input type="number" min={1} max={equipment?.requirePlate ? 1 : undefined} value={equipment?.requirePlate ? "1" : row.total} disabled={equipment?.requirePlate} onChange={(event) => updateRow(row.key, { total: event.target.value })} onBlur={() => { if (!row.total) updateRow(row.key, { total: "1" }); }} className="h-11 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" /></label><label><span className="mb-1 block text-sm font-semibold">Serial/ทะเบียน</span><input value={row.plateNumber} disabled={!equipment?.requirePlate} required={Boolean(equipment?.requirePlate)} onChange={(event) => updateRow(row.key, { plateNumber: event.target.value })} placeholder={equipment?.requirePlate ? "กรอกหมายเลข" : "ไม่ต้องระบุ"} className="h-11 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100 disabled:text-slate-400" /></label></div>{equipment && <div className="mt-3 flex items-center gap-3 rounded-xl bg-blue-50/70 p-2.5"><Image src={equipment.picture} alt={equipment.name} width={42} height={42} unoptimized className="size-11 rounded-lg bg-white object-contain p-1" /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{equipment.name}</p><p className="text-xs text-slate-500">{equipment.category} · {equipment.requirePlate ? "แยกรายคัน/Serial" : "นับตามจำนวน"}</p></div></div>}</>}</section>; })}<button type="button" onClick={() => { setTouched(true); setRows((current) => [...current, createRow()]); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 font-bold text-blue-700 transition hover:bg-blue-50"><Plus className="size-5" />เพิ่มแถวรายการ</button>{error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}</div><div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-white p-4 sm:p-5"><button type="button" onClick={close} className="h-12 rounded-xl bg-slate-100 font-bold text-slate-600">ยกเลิก</button><button type="button" onClick={submit} className="h-12 rounded-xl bg-blue-600 font-bold text-white">ยืนยันเพิ่ม {rows.length} รายการ</button></div></div></div>;
}

function CategoryEditor({ item }: { item: Record<string, unknown> }) {
  const [icon, setIcon] = useState(String(item.icon || "Boxes"));
  return <><Input name="name" label="ชื่อหมวดหมู่" value={item.name} /><input type="hidden" name="oldName" value={String(item.name || "")} /><input type="hidden" name="icon" value={icon} /><div className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">ไอคอนหมวดหมู่</span><div className="max-h-[48dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2"><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{categoryIconOptions.map(({ name, label, Icon }) => <button key={name} type="button" data-form-value onClick={() => setIcon(name)} className={`flex min-w-0 flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${icon === name ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}><Icon className="size-5" /><span className="w-full truncate text-[11px] font-semibold">{label}</span></button>)}</div></div></div></>;
}

function EquipmentEditor({ item, categories }: { item: Record<string, unknown>; categories: AdminData["categories"] }) {
  const [picture, setPicture] = useState(String(item.picture || ""));
  const [preparing, setPreparing] = useState(false);
  async function upload(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { event.target.value = ""; return; } setPreparing(true); try { setPicture(await compressImageForSheet(file, { preserveFormat: true })); } finally { setPreparing(false); } }
  return <><Input name="name" label="ชื่อยุทโธปกรณ์" value={item.name} /><CategoryInput value={item.category} categories={categories} /><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3 sm:col-span-2"><span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">{picture ? <Image src={picture} alt="รูปยุทโธปกรณ์" width={100} height={100} unoptimized className="size-full object-contain" /> : <PackagePlus className="size-6 text-blue-500" />}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{preparing ? "กำลังเตรียมรูป..." : picture ? "เปลี่ยนรูปยุทโธปกรณ์" : "เพิ่มรูปยุทโธปกรณ์"}</span><span className="text-xs text-slate-500">JPG/PNG ไม่เกิน 5 MB</span></span><input type="file" accept="image/*" onChange={upload} className="sr-only" /><input type="hidden" name="picture" value={picture} /></label><label className="flex items-center gap-3 sm:col-span-2"><input type="checkbox" name="requirePlate" value="true" defaultChecked={Boolean(item.requirePlate)} /> แยกรายคัน/ทะเบียน</label></>;
}

function InventoryEditor({ data, initialCompanyId, initialInventoryId }: { data: AdminData; initialCompanyId: string; initialInventoryId: string }) {
  const initialStock = data.inventories.filter((item) => !initialCompanyId || item.companyId === initialCompanyId);
  const [inventoryId, setInventoryId] = useState(initialInventoryId || initialStock[0]?.id || data.inventories[0]?.id || "");
  const selected = data.inventories.find((item) => item.id === inventoryId);
  const [total, setTotal] = useState(selected?.total || 1);
  const effectiveTotal = selected?.requirePlate ? 1 : total;
  const available = Math.max(0, effectiveTotal - (selected?.borrowed || 0) - (selected?.broken || 0));
  const options = data.inventories.map((item) => ({ value: item.id, label: item.equipmentName, description: `${item.companyName}${item.plateNumber ? ` · ${item.plateNumber}` : ""}`, image: data.equipments.find((equipment) => equipment.id === item.equipmentId)?.picture }));
  return <><div className="sm:col-span-2"><SelectControl label="กองร้อยและยุทโธปกรณ์ที่ต้องการจัดการ" value={inventoryId} onChange={(nextId) => { const next = data.inventories.find((item) => item.id === nextId); setInventoryId(nextId); setTotal(next?.requirePlate ? 1 : next?.total || 1); }} options={options} /></div><input type="hidden" name="id" value={selected?.id || ""} /><input type="hidden" name="companyId" value={selected?.companyId || ""} /><input type="hidden" name="equipmentId" value={selected?.equipmentId || ""} />{selected?.requirePlate ? <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Serial/ทะเบียน</span><div className="relative"><Hash className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-violet-500" /><input key={selected.id} name="plateNumber" defaultValue={selected.plateNumber} required className="h-11 w-full rounded-xl border border-violet-200 bg-violet-50/50 pl-10 pr-3 font-mono outline-none focus:border-violet-500" placeholder="กรอก Serial หรือทะเบียน" /></div>{selected.borrowed > 0 && <span className="mt-1 block text-xs text-amber-600">รายการนี้กำลังถูกยืม ระบบจะไม่อนุญาตให้เปลี่ยน Serial จนกว่าจะคืนเสร็จ</span>}</label> : <input type="hidden" name="plateNumber" value="" />}{selected?.requirePlate ? <><input type="hidden" name="total" value="1" /><ReadOnlyNumber label="จำนวนรวม (รายการ Serial)" value={1} tone="text-violet-700" /></> : <InputControl name="total" label="จำนวนรวม" value={total} onChange={setTotal} min={Math.max(1, (selected?.borrowed || 0) + (selected?.broken || 0))} />}<ReadOnlyNumber label="พร้อมใช้ (คำนวณอัตโนมัติ)" value={available} tone="text-emerald-700" /><ReadOnlyNumber label="ถูกยืม (แก้ไขไม่ได้)" value={selected?.borrowed || 0} tone="text-amber-700" /><ReadOnlyNumber label="ชำรุด" value={selected?.broken || 0} tone="text-red-700" /></>;
}

function InventoryAddEditor({ data, initialCompanyId }: { data: AdminData; initialCompanyId: string }) {
  const [companyId, setCompanyId] = useState(initialCompanyId || data.companies[0]?.id || "");
  const [equipmentId, setEquipmentId] = useState(data.equipments[0]?.id || "");
  const equipment = data.equipments.find((item) => item.id === equipmentId);
  const [total, setTotal] = useState(1);
  const cappedTotal = equipment?.requirePlate ? 1 : total;
  const equipmentOptions = data.equipments.map((item) => ({ value: item.id, label: item.name, description: item.category, image: item.picture }));
  return <><SelectControl label="กองร้อย" value={companyId} onChange={setCompanyId} options={data.companies.map((company) => [company.id, company.name])} name="companyId" /><SelectControl label="ชนิดยุทโธปกรณ์" value={equipmentId} onChange={(nextId) => { setEquipmentId(nextId); if (data.equipments.find((item) => item.id === nextId)?.requirePlate) setTotal(1); }} options={equipmentOptions} name="equipmentId" /><label className="block"><span className="mb-1 block text-sm font-semibold">ทะเบียน/หมายเลขประจำรายการ</span><input name="plateNumber" disabled={!equipment?.requirePlate} required={Boolean(equipment?.requirePlate)} placeholder={equipment?.requirePlate ? "กรอกทะเบียนหรือหมายเลข" : "ยุทโธปกรณ์ชนิดนี้ไม่ต้องระบุ"} className="h-11 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100 disabled:text-slate-400" /></label><InputControl name="total" label="จำนวนที่เพิ่มเข้าคลัง" value={cappedTotal} onChange={setTotal} min={1} max={equipment?.requirePlate ? 1 : undefined} /><div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800 sm:col-span-2">ระบบจะเพิ่มจำนวนรวมและจำนวนพร้อมใช้ให้อัตโนมัติ โดยไม่อนุญาตให้กำหนดยอดถูกยืมจากเมนูนี้</div></>;
}

function TransferEditor({ data }: { data: AdminData }) {
  const transferable = data.inventories.filter((item) => item.available > 0 && (!item.assetOwnerCompanyId || item.assetOwnerCompanyId === item.companyId));
  const sourceCompanies = data.companies.filter((company) => transferable.some((item) => item.companyId === company.id));
  const [sourceCompanyId, setSourceCompanyId] = useState(sourceCompanies[0]?.id || "");
  const available = transferable.filter((item) => item.companyId === sourceCompanyId);
  const [sourceId, setSourceId] = useState(available[0]?.id || "");
  const source = available.find((item) => item.id === sourceId);
  const [quantity, setQuantity] = useState(1);
  const cappedQuantity = Math.min(quantity, source?.available || 1);
  const sourceOptions = available.map((item) => ({ value: item.id, label: item.equipmentName, description: `${item.plateNumber ? `${item.plateNumber} · ` : ""}มี ${item.available.toLocaleString("th-TH")}`, image: data.equipments.find((equipment) => equipment.id === item.equipmentId)?.picture }));
  return <><SelectControl label="กองร้อยต้นทาง" value={sourceCompanyId} onChange={(nextCompanyId) => { const nextItems = transferable.filter((item) => item.companyId === nextCompanyId); setSourceCompanyId(nextCompanyId); setSourceId(nextItems[0]?.id || ""); setQuantity(1); }} options={sourceCompanies.map((company) => [company.id, company.name])} /><SelectControl name="sourceInventoryId" label="ยุทโธปกรณ์ต้นทาง" value={sourceId} onChange={(nextId) => { setSourceId(nextId); setQuantity(1); }} options={sourceOptions} /><Select name="destinationCompanyId" label="กองร้อยปลายทาง" options={data.companies.filter((company) => company.id !== sourceCompanyId).map((company) => [company.id, company.name])} /><InputControl name="quantity" label={`จำนวนที่เคลื่อนย้าย (มี ${source?.available || 0})`} value={cappedQuantity} onChange={setQuantity} min={1} max={source?.available || 1} /><div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 sm:col-span-2">เลือกกองร้อยต้นทางก่อน ระบบจะแสดงเฉพาะยุทโธปกรณ์ที่พร้อมเคลื่อนย้าย และปรับยอดทั้งสองกองร้อยพร้อมบันทึก Audit Log</div></>;
}

function SelectControl({ label, value, onChange, options, name }: { label: string; value: string; onChange: (value: string) => void; options: Array<string[] | CompactSelectOption>; name?: string }) { return <label className="min-w-0"><span className="mb-1 block text-sm font-semibold">{label}</span><CompactSelect name={name} value={value} onChange={onChange} required searchable options={normalizeOptions(options)} /></label>; }
function InputControl({ name, label, value, onChange, min, max }: { name: string; label: string; value: number; onChange: (value: number) => void; min: number; max?: number }) { return <label className="block"><span className="mb-1 block text-sm font-semibold">{label}</span><input name={name} type="number" value={value} onChange={(event) => onChange(Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.floor(Number(event.target.value) || min))))} min={min} max={max} required className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>; }
function ReadOnlyNumber({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold ${tone}`}>{value.toLocaleString("th-TH")}</p></div>; }

function CompanyFilter({ value, onChange, companies }: { value: string; onChange: (value: string) => void; companies: AdminData["companies"] }) {
  return <label className="relative block min-w-0 flex-1 sm:max-w-sm"><Filter className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" /><CompactSelect value={value} onChange={onChange} placeholder="แสดงทั้งหมด" searchable className="pl-10" options={companies.map((company) => ({ value: company.id, label: company.name }))} /></label>;
}

function DateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600"><span className="shrink-0">วันที่</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3" />{value && <button type="button" onClick={() => onChange("")} className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500" aria-label="ล้างวันที่"><X className="size-4" /></button>}</label>; }

function Toolbar({ children }: { children: React.ReactNode }) { return <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">{children}</div>; }
function Section({ title, action, onAdd, children }: { title: string; action?: string; onAdd?: () => void; children: React.ReactNode }) { return <section className="mt-6"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-lg font-bold">{title}</h3>{action && <button type="button" onClick={onAdd} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white"><PackagePlus className="size-4" />{action}</button>}</div>{children}</section>; }
function Card({ title, detail, meta, onClick }: { title: string; detail: string; meta: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-md transition hover:border-blue-300 active:scale-[0.99]"><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-blue-600">{detail}</p><p className="mt-2 truncate text-xs text-slate-500">{meta}</p></button>; }
function Stat({ number, label }: { number: number; label: string }) { return <div><p className="text-lg font-bold">{number.toLocaleString("th-TH")}</p><p className="text-slate-500">{label}</p></div>; }
function Summary({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value.toLocaleString("th-TH")}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }
function DocumentCell({ id }: { id: string }) { return <td className="max-w-[150px] px-4 py-2.5"><span className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-500">{id || "-"}</span></td>; }
function Input({ name, label, value = "", type = "text", optional = false }: { name: string; label: string; value?: unknown; type?: string; optional?: boolean }) { return <label className="block"><span className="mb-1 block text-sm font-semibold">{label}</span><input name={name} type={type} defaultValue={String(value)} required={!optional} min={type === "number" ? 0 : undefined} className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>; }
function CategoryInput({ value = "", categories }: { value?: unknown; categories: AdminData["categories"] }) { return <label className="block"><span className="mb-1 block text-sm font-semibold">หมวดหมู่</span><CompactSelect name="category" defaultValue={String(value || categories[0]?.name || "")} required searchable placeholder="เลือกหมวดหมู่" options={categories.map((category) => ({ value: category.name, label: category.name, description: category.icon }))} /><span className="mt-1 block text-xs text-slate-500">หากยังไม่มีหมวดหมู่ที่ต้องการ ให้กดปุ่ม “เพิ่มหมวดหมู่” ก่อน</span></label>; }
function Select({ name, label, value = "", options }: { name: string; label: string; value?: unknown; options: Array<string[] | CompactSelectOption> }) { return <label className="min-w-0"><span className="mb-1 block text-sm font-semibold">{label}</span><CompactSelect name={name} defaultValue={String(value)} searchable options={normalizeOptions(options)} /></label>; }

function normalizeOptions(options: Array<string[] | CompactSelectOption>): CompactSelectOption[] {
  return options.map((option) => Array.isArray(option) ? { value: option[0], label: option[1], image: option[2] } : option);
}
const format = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value || "-" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date); };
const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date); };
const localDateKey = (value: string) => { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const transactionStatus = (status: string) => ({ borrowed: "กำลังยืม", returned: "คืนแล้ว", overdue: "เกินกำหนด", defective: "แจ้งชำรุด" } as Record<string, string>)[status.toLowerCase()] || status;
