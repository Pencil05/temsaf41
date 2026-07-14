"use client";

import { ChevronDown, Download, Eye, FileImage, FileText, PackageCheck, PackagePlus, Wrench, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { receiptCanvas } from "@/lib/client-media";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";
import type { UserHistoryItem } from "@/lib/google-sheets";

export function HistoryClient({
  items,
  initialTx,
}: {
  items: UserHistoryItem[];
  initialTx?: string;
}) {
  const [selected, setSelected] = useState<UserHistoryItem | null>(items.find((item) => item.id === initialTx || item.transactionIds.includes(initialTx || "")) || null);
  const [downloads, setDownloads] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const groups = useMemo(() => groupHistoryByDate(items), [items]);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const receiptRef = useRef<HTMLDivElement>(null);
  usePopupDismiss(Boolean(selected) && !downloads, () => setSelected(null));
  usePopupDismiss(downloads, () => setDownloads(false));

  async function canvas() {
    if (!receiptRef.current) throw new Error("Receipt unavailable");
    return receiptCanvas(receiptRef.current);
  }

  async function jpg() {
    setProcessing(true);
    setMessage("");
    try {
      const image = await canvas();
      const link = document.createElement("a");
      link.download = `${selected?.id}.jpg`;
      link.href = image.toDataURL("image/jpeg", 0.95);
      link.click();
      setDownloads(false);
    } catch {
      setMessage("ไม่สามารถสร้างไฟล์ JPG ได้");
    } finally {
      setProcessing(false);
    }
  }

  async function pdf() {
    setProcessing(true);
    setMessage("");
    try {
      const image = await canvas();
      const { jsPDF } = await import("jspdf");
      const document = new jsPDF();
      const width = 186;
      document.addImage(image.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, image.height * width / image.width);
      document.save(`${selected?.id}.pdf`);
      setDownloads(false);
    } catch {
      setMessage("ไม่สามารถสร้างไฟล์ PDF ได้");
    } finally {
      setProcessing(false);
    }
  }

  return <>
    {processing && <ActionLoadingOverlay message="กำลังสร้างไฟล์ใบเสร็จ..." />}
    {message && <button onClick={() => setMessage("")} className="fixed left-4 right-4 top-4 z-[210] mx-auto max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">{message}</button>}

    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.length ? groups.map(({ key, label, items: dateItems }) => {
        const collapsed = collapsedDates.has(key);
        return <div key={key} className="border-b border-slate-200 last:border-b-0">
          <button type="button" onClick={() => setCollapsedDates((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100">
            <ChevronDown className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            <span className="font-semibold text-slate-800">{label}</span>
            <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">{dateItems.length} รายการ</span>
          </button>
          {!collapsed && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-y border-slate-200 bg-white text-left text-xs text-slate-500"><tr><th className="px-4 py-2 font-medium">ประเภท</th><th className="px-4 py-2 font-medium">ยุทโธปกรณ์</th><th className="px-4 py-2 font-medium">จำนวน</th><th className="px-4 py-2 font-medium">ต้นทาง → ปลายทาง</th><th className="px-4 py-2 font-medium">เวลา</th><th className="px-4 py-2 text-right font-medium">รายละเอียด</th></tr></thead><tbody>{dateItems.map((item) => {
            const returned = item.movementType === "return";
            const defective = item.movementType === "defect";
            const openReceipt = () => { setDownloads(false); setSelected(item); };
            return <tr key={`${item.movementType}:${item.id}`} tabIndex={0} onClick={openReceipt} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReceipt(); } }} className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"><td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${defective ? "bg-orange-50 text-orange-700" : returned ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{defective ? <Wrench className="size-3.5" /> : returned ? <PackageCheck className="size-3.5" /> : <PackagePlus className="size-3.5" />}{defective ? "แจ้งเสีย" : returned ? "คืน" : "เบิก"}</span></td><td className="max-w-[240px] truncate px-4 py-2.5 font-semibold">{item.equipmentName}</td><td className="px-4 py-2.5">{item.quantity.toLocaleString("th-TH")}</td><td className="max-w-[260px] truncate px-4 py-2.5 text-slate-600">{defective ? item.ownerCompanyName || "-" : `${item.ownerCompanyName} → ${item.borrowerCompanyName}`}</td><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatTime(item.date)}</td><td className="px-4 py-2 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); openReceipt(); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold transition hover:border-blue-400 hover:text-blue-600"><Eye className="size-3.5" />ดูใบเสร็จ</button></td></tr>;
          })}</tbody></table></div>}
        </div>;
      }) : <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการทำรายการ</div>}
    </section>

    {selected && (
      <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]">
          <div ref={receiptRef}>
            <ReceiptDocument
              title={selected.movementType === "defect" ? "รายละเอียดการแจ้งยุทโธปกรณ์ชำรุด" : selected.movementType === "return" ? "รายละเอียดการคืนยุทโธปกรณ์" : "รายละเอียดการเบิกยุทโธปกรณ์"}
              referenceId={selected.id}
              status={selected.status}
              date={selected.date}
              operatorName={selected.borrowerName}
              contactPhone={selected.contactPhone}
              contactEmail={selected.contactEmail}
              ownerCompanyName={selected.movementType === "defect" ? undefined : selected.ownerCompanyName}
              borrowerCompanyName={selected.movementType === "defect" ? undefined : selected.borrowerCompanyName}
              dueDate={selected.movementType === "borrow" ? selected.dueDate : undefined}
              note={selected.note}
              evidenceImage={selected.evidenceImage}
              items={selected.items.map((item) => ({ name: item.name, quantity: item.quantity, plateNumber: item.plateNumber }))}
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setSelected(null)} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button>
            <button onClick={() => setDownloads(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white"><Download className="size-5" /></button>
          </div>
        </div>
      </div>
    )}

    {downloads && (
      <div className="popup-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setDownloads(false); }}>
        <div className="popup-panel w-full max-w-xs rounded-[24px] bg-white p-5">
          <div className="flex justify-between">
            <h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3>
            <button onClick={() => setDownloads(false)}><X className="size-5" /></button>
          </div>
          <div className="mt-4 space-y-3">
            <button onClick={jpg} className="flex w-full items-center gap-3 rounded-xl bg-blue-50 p-4 font-semibold text-blue-700"><FileImage className="size-5" />ไฟล์รูป JPG</button>
            <button onClick={pdf} className="flex w-full items-center gap-3 rounded-xl bg-red-50 p-4 font-semibold text-red-700"><FileText className="size-5" />ไฟล์ PDF</button>
          </div>
        </div>
      </div>
    )}
  </>;
}

function groupHistoryByDate(items: UserHistoryItem[]) {
  const groups = new Map<string, UserHistoryItem[]>();
  [...items].sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime()).forEach((item) => {
    const date = new Date(item.date);
    const key = Number.isNaN(date.getTime()) ? "unknown" : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const records = groups.get(key) || [];
    records.push(item);
    groups.set(key, records);
  });
  return [...groups].map(([key, records]) => ({ key, label: key === "unknown" ? "ไม่ระบุวันที่" : new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date(records[0].date)), items: records }));
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date);
}
