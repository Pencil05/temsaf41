"use client";

import { CalendarClock, Download, FileImage, FileText, PackageCheck, PackagePlus, Wrench, X } from "lucide-react";
import { useRef, useState } from "react";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { receiptCanvas } from "@/lib/client-media";
import type { UserHistoryItem } from "@/lib/google-sheets";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "ไม่ระบุวันที่" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function HistoryClient({ items, initialTx }: { items: UserHistoryItem[]; initialTx?: string }) {
  const [selected, setSelected] = useState<UserHistoryItem | null>(items.find((item) => item.id === initialTx || item.transactionIds.includes(initialTx || "")) || null);
  const [downloads, setDownloads] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);

  async function canvas() {
    if (!receiptRef.current) throw new Error("Receipt unavailable");
    return receiptCanvas(receiptRef.current);
  }

  async function jpg() {
    setProcessing(true); setMessage(""); try { const image = await canvas(); const link = document.createElement("a"); link.download = `${selected?.id}.jpg`; link.href = image.toDataURL("image/jpeg", 0.95); link.click(); setDownloads(false); } catch { setMessage("ไม่สามารถสร้างไฟล์ JPG ได้"); } finally { setProcessing(false); }
  }

  async function pdf() {
    setProcessing(true); setMessage(""); try { const image = await canvas(); const { jsPDF } = await import("jspdf"); const document = new jsPDF(); const width = 186; document.addImage(image.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, image.height * width / image.width); document.save(`${selected?.id}.pdf`); setDownloads(false); } catch { setMessage("ไม่สามารถสร้างไฟล์ PDF ได้"); } finally { setProcessing(false); }
  }

  return <>
    {processing && <ActionLoadingOverlay message="กำลังสร้างไฟล์ใบเสร็จ..." />}
    {message && <button onClick={() => setMessage("")} className="fixed left-4 right-4 top-4 z-[210] mx-auto max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">{message}</button>}
    <section className="mt-6 space-y-3">{items.length ? items.map((item) => {
      const returned = item.status.toLowerCase() === "returned";
      const defective = item.movementType === "defect";
      return <button key={item.id} onClick={() => setSelected(item)} className="block w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200"><div className="flex items-start gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${defective ? "bg-orange-100 text-orange-600" : returned ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-700"}`}>{defective ? <Wrench className="size-5" /> : returned ? <PackageCheck className="size-5" /> : <PackagePlus className="size-5" />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="font-bold text-slate-800">{item.equipmentName}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${defective ? "bg-orange-50 text-orange-700" : returned ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{defective ? "แจ้งเสีย" : returned ? "คืนแล้ว" : item.status}</span></div><p className="mt-1 text-sm text-slate-600">จำนวน {item.quantity.toLocaleString("th-TH")}{!defective && <> · {item.ownerCompanyName} → {item.borrowerCompanyName}</>}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><CalendarClock className="size-3.5" />{formatDate(item.date)}</p></div></div></button>;
    }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการทำรายการ</div>}</section>

    {selected && <div className="popup-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true"><div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 sm:rounded-[30px]"><div ref={receiptRef}><ReceiptDocument title={selected.movementType === "defect" ? "รายละเอียดการแจ้งยุทโธปกรณ์ชำรุด" : selected.movementType === "return" ? "รายละเอียดการคืนยุทโธปกรณ์" : "รายละเอียดการเบิกยุทโธปกรณ์"} referenceId={selected.id} status={selected.status} date={selected.date} operatorName={selected.borrowerName} ownerCompanyName={selected.movementType === "defect" ? undefined : selected.ownerCompanyName} borrowerCompanyName={selected.movementType === "defect" ? undefined : selected.borrowerCompanyName} dueDate={selected.movementType === "borrow" ? selected.dueDate : undefined} note={selected.note} evidenceImage={selected.evidenceImage} items={selected.items.map((item) => ({ name: item.name, quantity: item.quantity, plateNumber: item.plateNumber }))} /></div><div className="mt-4 flex gap-3"><button onClick={() => setSelected(null)} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button><button onClick={() => setDownloads(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white"><Download className="size-5" /></button></div></div></div>}
    {downloads && <div className="popup-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-6" role="dialog" aria-modal="true"><div className="popup-panel w-full max-w-xs rounded-[24px] bg-white p-5"><div className="flex justify-between"><h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3><button onClick={() => setDownloads(false)}><X className="size-5" /></button></div><div className="mt-4 space-y-3"><button onClick={jpg} className="flex w-full items-center gap-3 rounded-xl bg-blue-50 p-4 font-semibold text-blue-700"><FileImage className="size-5" />ไฟล์รูป JPG</button><button onClick={pdf} className="flex w-full items-center gap-3 rounded-xl bg-red-50 p-4 font-semibold text-red-700"><FileText className="size-5" />ไฟล์ PDF</button></div></div></div>}
  </>;
}
