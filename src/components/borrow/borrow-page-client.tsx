"use client";

import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Hash,
  PackageCheck,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import type {
  BorrowInventoryItem,
  BorrowPageData,
  BorrowReceipt,
} from "@/lib/borrow-service";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { CompactSelect } from "@/components/ui/compact-select";
import { compressImageForSheet, receiptCanvas } from "@/lib/client-media";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { EquipmentImage } from "@/components/equipment/equipment-image";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";

type Toast = { type: "success" | "error"; message: string } | null;
type QuantityValue = number | "";

export function BorrowPageClient({ data }: { data: BorrowPageData }) {
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Record<string, QuantityValue>>({});
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [borrowerCompanyId, setBorrowerCompanyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidencePreview, setEvidencePreview] = useState("");
  const [evidenceImage, setEvidenceImage] = useState("");
  const [isPreparingEvidence, setIsPreparingEvidence] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [receipt, setReceipt] = useState<BorrowReceipt | null>(null);
  const [reviewReceipt, setReviewReceipt] = useState<BorrowReceipt | null>(null);
  const selfUse = borrowerCompanyId === data.ownerCompanyId;
  usePopupDismiss(Boolean(reviewReceipt), () => setReviewReceipt(null));
  usePopupDismiss(Boolean(receipt) && !downloadMenuOpen, () => setReceipt(null));
  usePopupDismiss(downloadMenuOpen, () => setDownloadMenuOpen(false));

  const selectedItems = useMemo(
    () => data.inventory.filter((item) => selected[item.selectionId] !== undefined),
    [data.inventory, selected],
  );
  const selectedQuantity = selectedItems.reduce(
    (total, item) => total + (item.requirePlate ? 1 : Number(selected[item.selectionId]) || 0),
    0,
  );
  const filteredInventory = useMemo(() => {
    const keyword = equipmentQuery.trim().toLocaleLowerCase("th");
    return keyword ? data.inventory.filter((item) => `${item.name} ${item.category} ${item.plateNumber || ""}`.toLocaleLowerCase("th").includes(keyword)) : data.inventory;
  }, [data.inventory, equipmentQuery]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  }

  function toggleItem(item: BorrowInventoryItem) {
    setSelected((current) => {
      const next = { ...current };
      if (next[item.selectionId] !== undefined) {
        delete next[item.selectionId];
      } else {
        next[item.selectionId] = 1;
      }
      return next;
    });
  }

  function updateQuantity(item: BorrowInventoryItem, rawValue: string) {
    const quantity: QuantityValue = rawValue === ""
      ? ""
      : Math.max(1, Math.min(item.available, Math.floor(Number(rawValue) || 1)));
    setSelected((current) => ({ ...current, [item.selectionId]: quantity }));
  }

  function normalizeQuantity(item: BorrowInventoryItem) {
    const quantity = Number(selected[item.selectionId]);
    setSelected((current) => ({
      ...current,
      [item.selectionId]: Math.max(1, Math.min(item.available, Math.floor(quantity || 1))),
    }));
  }

  async function handleEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("error", "กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "รูปหลักฐานต้องมีขนาดไม่เกิน 5 MB");
      event.target.value = "";
      return;
    }

    setIsPreparingEvidence(true);
    try {
      const compressed = await compressImageForSheet(file);
      setEvidencePreview(compressed);
      setEvidenceImage(compressed);
      setEvidenceName(file.name);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "ไม่สามารถเตรียมรูปหลักฐานได้");
      event.target.value = "";
    } finally {
      setIsPreparingEvidence(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItems.length) {
      showToast("error", "กรุณาเลือกยุทโธปกรณ์อย่างน้อย 1 รายการ");
      return;
    }
    const invalidItem = selectedItems.find((item) => !item.requirePlate && (Number(selected[item.selectionId]) < 1 || Number(selected[item.selectionId]) > item.available));
    if (invalidItem) {
      showToast("error", `กรุณาระบุจำนวน ${invalidItem.name} ระหว่าง 1-${invalidItem.available}`);
      return;
    }
    if (!borrowerCompanyId) {
      showToast("error", "กรุณาเลือกหน่วยงานผู้ยืม");
      return;
    }
    if (!dueDate || new Date(dueDate).getTime() <= Date.now()) {
      showToast("error", "กรุณาระบุวันและเวลาส่งคืนที่อยู่ในอนาคต");
      return;
    }
    if (selfUse && !note.trim()) {
      showToast("error", "กรุณาระบุสถานที่และวัตถุประสงค์ของการเบิกใช้งานภายในหน่วย");
      return;
    }

    const borrowerCompanyName = data.companies.find((company) => company.id === borrowerCompanyId)?.name || borrowerCompanyId;
    setReviewReceipt({
      txId: "รอยืนยันการบันทึก",
      date: new Date().toISOString(),
      borrowerName: data.borrowerName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      borrowerCompanyName,
      ownerCompanyName: data.ownerCompanyName,
      dueDate: new Date(dueDate).toISOString(),
      note: note.trim() || "-",
      evidenceImage,
      items: selectedItems.map((item) => ({
        name: item.name,
        quantity: item.requirePlate ? 1 : Number(selected[item.selectionId]),
        plateNumber: item.plateNumber,
      })),
    });
  }

  async function confirmBorrow() {
    if (!reviewReceipt) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerCompanyId,
          dueDate,
          note,
          evidenceName,
          evidenceImage,
          items: selectedItems.map((item) => ({
            inventoryId: item.inventoryId,
            quantity: item.requirePlate ? 1 : Number(selected[item.selectionId]),
            plateNumber: item.requirePlate ? item.plateNumber : undefined,
          })),
        }),
      });
      const payload = (await response.json()) as { receipt?: BorrowReceipt; error?: string };

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok || !payload.receipt) {
        showToast("error", payload.error || "ไม่สามารถยืนยันการเบิกได้");
        return;
      }

      setReceipt(payload.receipt);
      setReviewReceipt(null);
      setSelected({});
      setEvidenceName("");
      setEvidencePreview("");
      setEvidenceImage("");
      showToast("success", "บันทึกการเบิกเรียบร้อยแล้ว");
    } catch {
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function downloadJpg() {
    if (!receiptRef.current || !receipt) {
      return;
    }

    setIsDownloading(true);
    try {
      const canvas = await receiptCanvas(receiptRef.current);
      const link = document.createElement("a");
      link.download = `${receipt.txId}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      setDownloadMenuOpen(false);
    } catch {
      showToast("error", "ไม่สามารถสร้างไฟล์ JPG ได้ กรุณาลองใหม่");
    } finally {
      setIsDownloading(false);
    }
  }

  async function downloadPdf() {
    if (!receiptRef.current || !receipt) return;
    setIsDownloading(true);
    try {
      const canvas = await receiptCanvas(receiptRef.current);
      const { jsPDF } = await import("jspdf");
      const document = new jsPDF();
      const width = 186;
      const height = canvas.height * width / canvas.width;
      document.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, height);
      document.save(`${receipt.txId}.pdf`);
      setDownloadMenuOpen(false);
    } catch {
      showToast("error", "ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="theme-app-page min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_42%,#eef2ff_100%)] pb-32 text-slate-900">
      {(isSubmitting || isPreparingEvidence || isDownloading) && <ActionLoadingOverlay message={isPreparingEvidence ? "กำลังย่อและเตรียมรูปหลักฐาน..." : isDownloading ? "กำลังสร้างไฟล์ใบเสร็จ..." : "กำลังบันทึกการเบิก..."} />}
      {toast && (
        <div
          role="status"
          className={`fixed left-4 right-4 top-4 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-xl ${
            toast.type === "error"
              ? "border-red-200 bg-red-50/95 text-red-700"
              : "border-emerald-200 bg-emerald-50/95 text-emerald-700"
          }`}
        >
          {toast.type === "error" ? <X className="size-5" /> : <CheckCircle2 className="size-5" />}
          <span className="min-w-0 flex-1">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="ปิดการแจ้งเตือน">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8 lg:max-w-7xl">
        <header className="rounded-[28px] border border-white/70 bg-white/65 p-5 shadow-[0_18px_50px_rgba(37,99,235,0.12)] backdrop-blur-xl sm:p-7">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600">
            <ArrowLeft className="size-4" /> กลับหน้าหลัก
          </Link>
          <div className="mt-5 flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200">
              <PackageCheck className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-blue-600">{data.ownerCompanyName}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">เบิกยืมยุทโธปกรณ์</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">เลือกหลายรายการ กำหนดจำนวน และตรวจสอบข้อมูลก่อนยืนยัน</p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="rounded-[26px] border border-white/80 bg-white/75 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-6">
            <div className="flex items-end justify-between gap-4 ">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Step 1</p>
                <h2 className="mt-1 text-lg font-bold">เลือกยุทโธปกรณ์</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                เลือกแล้ว {selectedItems.length} รายการ
              </span>
            </div>

            <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={equipmentQuery} onChange={(event) => setEquipmentQuery(event.target.value)} placeholder="ค้นหาชื่อ หมวดหมู่ หรือทะเบียน..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none focus:border-blue-500" />{equipmentQuery && <button type="button" onClick={() => setEquipmentQuery("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>}</div>
            <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1 bg-white">
              {filteredInventory.length ? (
                filteredInventory.map((item) => {
                  const isSelected = selected[item.selectionId] !== undefined;
                  return (
                    <article
                      key={item.selectionId}
                      className={`equipment-selection-item overflow-hidden rounded-2xl border bg-white/75 shadow-[0_8px_22px_rgba(15,23,42,0.06)] transition ${
                        isSelected
                          ? "is-selected border-blue-400 bg-blue-50/80 shadow-md shadow-blue-100"
                          : "border-slate-200 hover:border-blue-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(item)}
                        className="flex w-full items-center gap-3 p-4 text-left"
                        aria-pressed={isSelected}
                      >
                        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 p-1.5">
                          <EquipmentImage name={item.name} className="size-full" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-800">{item.name}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {item.category} · พร้อมเบิก {item.available.toLocaleString("th-TH")}
                          </span>
                        </span>
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                            isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                      </button>

                      {isSelected && (
                        <div className="border-t border-blue-200/70 bg-white/60 px-4 py-3">
                          {item.requirePlate ? (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="flex items-center gap-2 text-slate-500">
                                <Hash className="size-4" /> หมายเลขทะเบียน
                              </span>
                              <span className="font-bold text-slate-800">{item.plateNumber || "ไม่ระบุ"}</span>
                            </div>
                          ) : (
                            <label className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-slate-600">จำนวนที่ต้องการเบิก</span>
                              <input
                                type="number"
                                min={1}
                                max={item.available}
                                value={selected[item.selectionId]}
                                onChange={(event) => updateQuantity(item, event.target.value)}
                                onBlur={() => normalizeQuantity(item)}
                                className="h-10 w-24 rounded-xl border border-blue-200 bg-white px-3 text-center font-bold text-blue-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  ไม่มียุทโธปกรณ์ที่พร้อมให้เบิกในขณะนี้
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[26px] border border-white/80 bg-white/75 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Step 2</p>
            <h2 className="mt-1 text-lg font-bold">รายละเอียดการเบิก</h2>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">หน่วยงานผู้ยืม</span>
                <CompactSelect value={borrowerCompanyId} onChange={setBorrowerCompanyId} required searchable placeholder="เลือกหน่วยงานปลายทาง" options={data.companies.map((company) => ({ value: company.id, label: company.name, description: company.id === data.ownerCompanyId ? "เบิกใช้งานภายในหน่วย" : undefined }))} />
              </label>

              {selfUse && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800"><p className="font-bold">เบิกใช้งานภายในหน่วย</p><p>ระบบจะกันจำนวนออกจากยอดพร้อมใช้ชั่วคราว โดยไม่ย้ายไปสร้างคลังใหม่ และต้องแจ้งคืนเข้าคลังเดิมเมื่อใช้งานเสร็จ</p></div>}

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarClock className="size-4 text-blue-600" /> วันและเวลาส่งคืน
                </span>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">หมายเหตุ / รายละเอียดเพิ่มเติม</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder={selfUse ? "ระบุสถานที่ใช้งานและวัตถุประสงค์ เช่น สนามฝึกด้านทิศเหนือ ใช้ฝึกประจำวัน" : "ระบุวัตถุประสงค์หรือข้อมูลเพิ่มเติม (ถ้ามี)"}
                  required={selfUse}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">รูปหลักฐาน</span>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-4 transition hover:bg-blue-50">
                  {evidencePreview ? (
                    <Image
                      src={evidencePreview}
                      alt="ตัวอย่างหลักฐาน"
                      width={56}
                      height={56}
                      unoptimized
                      className="size-14 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
                      <UploadCloud className="size-6" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-700">
                      {evidenceName || "แตะเพื่อเลือกรูปภาพ"}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">รองรับรูปไม่เกิน 5 MB · ระบบย่อและบันทึกรูปลงประวัติ</span>
                  </span>
                  <FileImage className="size-5 shrink-0 text-blue-500" />
                  <input type="file" accept="image/*" onChange={handleEvidence} className="sr-only" />
                </label>
              </div>
            </div>
          </section>
        </form>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/85 p-4 shadow-[0_-12px_35px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4 lg:max-w-7xl">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">ยอดที่เลือก</p>
            <p className="truncate text-sm font-bold text-slate-800">
              {selectedItems.length} รายการ · {selectedQuantity.toLocaleString("th-TH")} หน่วย
            </p>
          </div>
          <button
            type="button"
            onClick={() => document.querySelector<HTMLFormElement>("form")?.requestSubmit()}
            disabled={isSubmitting || !data.inventory.length}
            className="h-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-200 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "กำลังบันทึก..." : "ยืนยันการเบิก"}
          </button>
        </div>
      </div>

      {reviewReceipt && (
        <div className="popup-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewReceipt(null); }}>
          <div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div className="mb-3 px-1"><p className="font-bold text-slate-800">ตรวจสอบก่อนบันทึก</p><p className="text-xs text-slate-500">โปรดตรวจข้อมูลให้ครบถ้วน ระบบยังไม่บันทึกรายการในขั้นตอนนี้</p></div>
            <ReceiptDocument title="สลิปตรวจสอบการเบิกยุทโธปกรณ์" referenceId={reviewReceipt.txId} status="รอยืนยัน" date={reviewReceipt.date} operatorName={reviewReceipt.borrowerName} contactPhone={reviewReceipt.contactPhone} contactEmail={reviewReceipt.contactEmail} ownerCompanyName={reviewReceipt.ownerCompanyName} borrowerCompanyName={reviewReceipt.borrowerCompanyName} dueDate={reviewReceipt.dueDate} note={reviewReceipt.note} evidenceImage={reviewReceipt.evidenceImage} items={reviewReceipt.items} />
            <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => setReviewReceipt(null)} disabled={isSubmitting} className="h-12 rounded-full bg-white font-bold text-slate-600">ย้อนกลับแก้ไข</button><button type="button" onClick={confirmBorrow} disabled={isSubmitting} className="h-12 rounded-full bg-emerald-600 font-bold text-white disabled:opacity-60">{isSubmitting ? "กำลังบันทึก..." : "ยืนยันการเบิก"}</button></div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="popup-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
          <div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-bold text-slate-800">ใบรับรองดิจิทัล</p>
                <p className="text-xs text-slate-500">ดาวน์โหลดเก็บเป็นไฟล์ JPG หรือ PDF</p>
              </div>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="grid size-9 place-items-center rounded-full bg-white text-slate-500 shadow-sm"
                aria-label="ปิดใบรับรอง"
              >
                <X className="size-5" />
              </button>
            </div>

            <div ref={receiptRef}><ReceiptDocument title="รายละเอียดการเบิกยุทโธปกรณ์" referenceId={receipt.txId} status="บันทึกการเบิกแล้ว" date={receipt.date} operatorName={receipt.borrowerName} contactPhone={receipt.contactPhone} contactEmail={receipt.contactEmail} ownerCompanyName={receipt.ownerCompanyName} borrowerCompanyName={receipt.borrowerCompanyName} dueDate={receipt.dueDate} note={receipt.note} evidenceImage={receipt.evidenceImage} items={receipt.items} /></div>

            <div className="mt-4 flex gap-3"><button type="button" onClick={() => setReceipt(null)} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button><button type="button" onClick={() => setDownloadMenuOpen(true)} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200" aria-label="ดาวน์โหลดใบเสร็จ"><Download className="size-5" /></button></div>
          </div>
        </div>
      )}

      {downloadMenuOpen && receipt && (
        <div className="popup-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setDownloadMenuOpen(false); }}>
          <div className="popup-panel w-full max-w-xs rounded-[26px] bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3><button type="button" onClick={() => setDownloadMenuOpen(false)} className="grid size-9 place-items-center rounded-full bg-slate-100"><X className="size-5 text-slate-500" /></button></div><div className="mt-4 space-y-3"><button type="button" onClick={downloadJpg} disabled={isDownloading} className="flex w-full items-center gap-3 rounded-2xl bg-blue-50 p-4 text-left font-semibold text-blue-700 disabled:opacity-60"><FileImage className="size-5" />ดาวน์โหลดเป็นไฟล์รูป (JPG)</button><button type="button" onClick={downloadPdf} disabled={isDownloading} className="flex w-full items-center gap-3 rounded-2xl bg-red-50 p-4 text-left font-semibold text-red-700 disabled:opacity-60"><FileText className="size-5" />ดาวน์โหลดเป็นไฟล์ PDF</button></div></div>
        </div>
      )}
    </main>
  );
}
