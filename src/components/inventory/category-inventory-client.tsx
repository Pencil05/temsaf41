"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Package,
  Share2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { compressImageForSheet, createReceiptImageFile, receiptCanvas, sharePreparedReceipt } from "@/lib/client-media";
import type {
  BorrowReceipt,
  CategoryInventoryData,
  CategoryInventoryItem,
} from "@/lib/borrow-service";

type Toast = { type: "success" | "error"; message: string } | null;

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CategoryInventoryClient({ data }: { data: CategoryInventoryData }) {
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [activeItem, setActiveItem] = useState<CategoryInventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [companyId, setCompanyId] = useState("");
  const [note, setNote] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidenceImage, setEvidenceImage] = useState("");
  const [receipt, setReceipt] = useState<BorrowReceipt | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingEvidence, setIsPreparingEvidence] = useState(false);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [shareAsset, setShareAsset] = useState<{ id: string; file: File } | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!receipt) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!receiptRef.current) return;
      setIsPreparingShare(true);
      void createReceiptImageFile(receiptRef.current, `${receipt.txId}.jpg`)
        .then((file) => {
          if (!cancelled) setShareAsset({ id: receipt.txId, file });
        })
        .catch(() => {
          if (!cancelled) setToast({ type: "error", message: "ไม่สามารถเตรียมรูปสำหรับแชร์ได้" });
        })
        .finally(() => {
          if (!cancelled) setIsPreparingShare(false);
        });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [receipt]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }

  function openBorrowModal(item: CategoryInventoryItem) {
    setActiveItem(item);
    setQuantity(1);
    setCompanyId("");
    setNote("");
    setEvidenceName("");
    setEvidenceImage("");
  }

  async function handleEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      showToast("error", "กรุณาเลือกรูปภาพขนาดไม่เกิน 2 MB");
      event.target.value = "";
      return;
    }
    setIsPreparingEvidence(true);
    try {
      setEvidenceImage(await compressImageForSheet(file));
      setEvidenceName(file.name);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "ไม่สามารถเตรียมรูปหลักฐานได้");
    } finally {
      setIsPreparingEvidence(false);
    }
  }

  async function submitBorrow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeItem || !companyId) {
      showToast("error", "กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (quantity < 1 || quantity > activeItem.available) {
      showToast("error", `สามารถเบิกได้สูงสุด ${activeItem.available} รายการ`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerCompanyId: companyId,
          note,
          evidenceName,
          evidenceImage,
          items: [{
            inventoryId: activeItem.inventoryId,
            quantity: activeItem.requirePlate ? 1 : quantity,
          }],
        }),
      });
      const payload = (await response.json()) as { receipt?: BorrowReceipt; error?: string };

      if (!response.ok || !payload.receipt) {
        showToast("error", payload.error || "ไม่สามารถบันทึกการเบิกได้");
        return;
      }

      setActiveItem(null);
      setReceipt(payload.receipt);
      showToast("success", "บันทึกการเบิกเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function captureReceipt() {
    if (!receiptRef.current) {
      throw new Error("Receipt is not ready.");
    }
    return receiptCanvas(receiptRef.current);
  }

  async function downloadJpg() {
    setIsProcessingReceipt(true);
    try {
      const canvas = await captureReceipt();
      const link = document.createElement("a");
      link.download = `${receipt?.txId || "tems-receipt"}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      setDownloadMenuOpen(false);
    } catch {
      showToast("error", "ไม่สามารถสร้างไฟล์รูปได้");
    } finally {
      setIsProcessingReceipt(false);
    }
  }

  async function downloadPdf() {
    setIsProcessingReceipt(true);
    try {
      const canvas = await captureReceipt();
      const image = canvas.toDataURL("image/jpeg", 0.95);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const width = pageWidth - 24;
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(image, "JPEG", 12, 12, width, height);
      pdf.save(`${receipt?.txId || "tems-receipt"}.pdf`);
      setDownloadMenuOpen(false);
    } catch {
      showToast("error", "ไม่สามารถสร้างไฟล์ PDF ได้");
    } finally {
      setIsProcessingReceipt(false);
    }
  }

  async function shareReceipt() {
    if (!receipt || shareAsset?.id !== receipt.txId) return;
    const sharePromise = sharePreparedReceipt(shareAsset.file, `ใบเบิกยุทโธปกรณ์ ${receipt.txId}`);
    setIsProcessingReceipt(true);
    try {
      const result = await sharePromise;
      if (result === "downloaded") showToast("success", "อุปกรณ์นี้ไม่รองรับแชร์ไฟล์โดยตรง จึงดาวน์โหลดรูปให้แล้ว");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") showToast("error", "ไม่สามารถแชร์ใบเสร็จได้");
    } finally {
      setIsProcessingReceipt(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      {(isSubmitting || isPreparingEvidence || isProcessingReceipt || isPreparingShare) && <ActionLoadingOverlay message={isPreparingEvidence ? "กำลังเตรียมรูปหลักฐาน..." : isProcessingReceipt || isPreparingShare ? "กำลังเตรียมใบเสร็จ..." : "กำลังบันทึกการเบิกและปรับยอดคลัง..."} />}
      {toast && (
        <div className={`fixed left-4 right-4 top-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl ${toast.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {toast.type === "error" ? <X className="size-5" /> : <CheckCircle2 className="size-5" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="mx-auto max-w-5xl">
        <header className="rounded-[28px] bg-gradient-to-br from-blue-700 to-indigo-600 px-5 py-6 text-white shadow-xl shadow-blue-100 sm:px-8">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-100 hover:text-white">
            <ArrowLeft className="size-4" /> กลับหน้าหลัก
          </Link>
          <p className="mt-5 text-sm text-blue-100">{data.companyName}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{data.category}</h1>
          <p className="mt-2 text-sm text-blue-100">แตะรายการเพื่อแจ้งเบิกยุทโธปกรณ์</p>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.inventory.length ? data.inventory.map((item) => (
            <button
              key={item.inventoryId}
              type="button"
              onClick={() => openBorrowModal(item)}
              className="group overflow-hidden rounded-[24px] border border-slate-100 bg-white text-left shadow-[0_10px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-blue-100"
            >
              <div className="flex h-32 items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100">
                <Package className="size-16 text-blue-300 transition group-hover:scale-110 group-hover:text-blue-500" />
              </div>
              <div className="p-4">
                <h2 className="line-clamp-2 min-h-12 font-bold text-slate-800">{item.name}</h2>
                {item.requirePlate ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-600">ทะเบียน {item.plateNumber || "ยังไม่ระบุ"}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.broken > 0 ? "bg-red-100 text-red-700" : item.available > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {item.broken > 0 ? "ชำรุด" : item.available > 0 ? "พร้อมใช้งาน" : "ไม่อยู่ในคลัง"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <CountBox label="Total" value={item.total} tone="slate" />
                    <CountBox label="Available" value={item.available} tone="green" />
                    <CountBox label="Broken" value={item.broken} tone="red" />
                  </div>
                )}
              </div>
            </button>
          )) : (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              ไม่พบยุทโธปกรณ์ในหมวดหมู่นี้
            </div>
          )}
        </section>
      </div>

      {activeItem && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <form onSubmit={submitBorrow} className="w-full max-w-md rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-600">TEMS</p>
                <h2 className="mt-1 text-xl font-bold">แจ้งเบิกยุทโธปกรณ์</h2>
              </div>
              <button type="button" onClick={() => setActiveItem(null)} className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500"><X className="size-5" /></button>
            </div>
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-slate-50 p-3">
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-500"><Package className="size-8" /></span>
              <div className="min-w-0"><p className="font-bold text-slate-800">{activeItem.name}</p><p className="mt-1 text-xs text-slate-500">พร้อมเบิก {activeItem.available} รายการ</p></div>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-semibold">จำนวน</span><input type="number" min={1} max={Math.max(1, activeItem.available)} value={activeItem.requirePlate ? 1 : quantity} disabled={activeItem.requirePlate || activeItem.available < 1} onChange={(event) => setQuantity(Math.min(activeItem.available, Math.max(1, Number(event.target.value))))} className="h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100" />{activeItem.available < 1 && <span className="mt-2 block text-xs font-medium text-red-600">รายการนี้แสดงจากบัญชีแม่ แต่คลังของหน่วยยังไม่มียอดพร้อมเบิก</span>}</label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">เบิกไปที่</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="">เลือกกองร้อยปลายทาง</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">หมายเหตุ</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="ระบุหมายเหตุ (ถ้ามี)" className="h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-3"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-blue-600">{evidenceImage ? <Image src={evidenceImage} alt="รูปหลักฐาน" width={48} height={48} unoptimized className="size-12 object-cover" /> : <UploadCloud className="size-5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{evidenceName || "แนบรูปหลักฐาน"}</span><span className="block text-xs text-slate-500">รูปไม่เกิน 2 MB</span></span><input type="file" accept="image/*" onChange={handleEvidence} className="sr-only" /></label>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setActiveItem(null)} className="h-12 rounded-full bg-slate-100 font-bold text-slate-600">ยกเลิก</button><button type="submit" disabled={isSubmitting || activeItem.available < 1} className="h-12 rounded-full bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-100 disabled:opacity-60">{isSubmitting ? "กำลังบันทึก..." : "ยืนยัน"}</button></div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-md rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div ref={receiptRef} style={{ background: "#ffffff", color: "#0f172a", padding: 24, borderRadius: 20, fontFamily: "Arial, sans-serif" }}>
              <div style={{ textAlign: "center", borderBottom: "2px solid #2563eb", paddingBottom: 14 }}><div style={{ display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, background: "#2563eb", color: "#ffffff", fontWeight: 800 }}>TEMS</div><h2 style={{ margin: "12px 0 2px", fontSize: 19 }}>รายละเอียดการเบิกยุทโธปกรณ์</h2><p style={{ margin: 0, color: "#64748b", fontSize: 11 }}>เลขที่ {receipt.txId}</p></div>
              <div style={{ display: "grid", gap: 10, marginTop: 18, fontSize: 13 }}><p style={{ margin: 0 }}><strong>ยุทโธปกรณ์:</strong> {receipt.items[0]?.name}</p><p style={{ margin: 0 }}><strong>จำนวน:</strong> {receipt.items[0]?.quantity}</p><p style={{ margin: 0 }}><strong>วันที่เบิก:</strong> {formatThaiDate(receipt.date)}</p><p style={{ margin: 0 }}><strong>ผู้เบิก:</strong> {receipt.borrowerName}</p><p style={{ margin: 0 }}><strong>เบิกไปที่:</strong> {receipt.borrowerCompanyName}</p><p style={{ margin: 0 }}><strong>หมายเหตุ:</strong> {receipt.note}</p></div>
              <div style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid #cbd5e1", textAlign: "center", color: "#64748b", fontSize: 10 }}>เอกสารสร้างโดยระบบ TEMS</div>
            </div>
            <div className="mt-4 flex gap-3"><button type="button" onClick={() => setReceipt(null)} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button><button type="button" onClick={shareReceipt} disabled={shareAsset?.id !== receipt.txId || isProcessingReceipt} className="grid size-12 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-200 disabled:opacity-50" aria-label="แชร์ภาพ"><Share2 className="size-5" /></button><button type="button" onClick={() => setDownloadMenuOpen(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200" aria-label="ดาวน์โหลด"><Download className="size-5" /></button></div>
          </div>
        </div>
      )}

      {downloadMenuOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-[26px] bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-bold">เลือกรูปแบบดาวน์โหลด</h3><button type="button" onClick={() => setDownloadMenuOpen(false)}><X className="size-5 text-slate-500" /></button></div><div className="mt-4 space-y-3"><button type="button" onClick={downloadJpg} className="flex w-full items-center gap-3 rounded-2xl bg-blue-50 p-4 text-left font-semibold text-blue-700"><FileImage className="size-5" />ดาวน์โหลดเป็นไฟล์รูป (JPG)</button><button type="button" onClick={downloadPdf} className="flex w-full items-center gap-3 rounded-2xl bg-red-50 p-4 text-left font-semibold text-red-700"><FileText className="size-5" />ดาวน์โหลดเป็นไฟล์ PDF</button></div></div>
        </div>
      )}
    </main>
  );
}

function CountBox({ label, value, tone }: { label: string; value: number; tone: "slate" | "green" | "red" }) {
  const colors = { slate: "bg-slate-50 text-slate-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700" };
  return <span className={`rounded-xl px-1 py-2 ${colors[tone]}`}><span className="block text-base font-bold">{value.toLocaleString("th-TH")}</span><span className="block text-[10px]">{label}</span></span>;
}
