"use client";

import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileImage,
  Hash,
  PackageCheck,
  Share2,
  Truck,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  BorrowInventoryItem,
  BorrowPageData,
  BorrowReceipt,
} from "@/lib/borrow-service";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { compressImageForSheet, createReceiptImageFile, receiptCanvas, sharePreparedReceipt } from "@/lib/client-media";

type Toast = { type: "success" | "error"; message: string } | null;

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BorrowPageClient({ data }: { data: BorrowPageData }) {
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [borrowerCompanyId, setBorrowerCompanyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidencePreview, setEvidencePreview] = useState("");
  const [evidenceImage, setEvidenceImage] = useState("");
  const [isPreparingEvidence, setIsPreparingEvidence] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [shareAsset, setShareAsset] = useState<{ id: string; file: File } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [receipt, setReceipt] = useState<BorrowReceipt | null>(null);

  const selectedItems = useMemo(
    () => data.inventory.filter((item) => selected[item.inventoryId] !== undefined),
    [data.inventory, selected],
  );
  const selectedQuantity = selectedItems.reduce(
    (total, item) => total + (item.requirePlate ? 1 : selected[item.inventoryId]),
    0,
  );

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
    window.setTimeout(() => setToast(null), 4500);
  }

  function toggleItem(item: BorrowInventoryItem) {
    setSelected((current) => {
      const next = { ...current };
      if (next[item.inventoryId] !== undefined) {
        delete next[item.inventoryId];
      } else {
        next[item.inventoryId] = 1;
      }
      return next;
    });
  }

  function updateQuantity(item: BorrowInventoryItem, rawValue: string) {
    const quantity = Math.max(1, Math.min(item.available, Math.floor(Number(rawValue) || 1)));
    setSelected((current) => ({ ...current, [item.inventoryId]: quantity }));
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
    if (file.size > 2 * 1024 * 1024) {
      showToast("error", "รูปหลักฐานต้องมีขนาดไม่เกิน 2 MB");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedItems.length) {
      showToast("error", "กรุณาเลือกยุทโธปกรณ์อย่างน้อย 1 รายการ");
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
            quantity: item.requirePlate ? 1 : selected[item.inventoryId],
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

  async function downloadReceipt() {
    if (!receiptRef.current || !receipt) {
      return;
    }

    setIsDownloading(true);
    try {
      const canvas = await receiptCanvas(receiptRef.current);
      const link = document.createElement("a");
      link.download = `${receipt.txId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      showToast("error", "ไม่สามารถสร้างรูปใบเบิกได้ กรุณาลองใหม่");
    } finally {
      setIsDownloading(false);
    }
  }

  async function shareReceipt() {
    if (!receipt || shareAsset?.id !== receipt.txId) return;
    const sharePromise = sharePreparedReceipt(shareAsset.file, `ใบเบิกยุทโธปกรณ์ ${receipt.txId}`);
    setIsSharing(true);
    try {
      const result = await sharePromise;
      if (result === "downloaded") showToast("success", "อุปกรณ์นี้ไม่รองรับแชร์ไฟล์โดยตรง จึงดาวน์โหลดรูปให้แล้ว");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") showToast("error", "ไม่สามารถแชร์ใบเสร็จได้");
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_42%,#eef2ff_100%)] pb-32 text-slate-900">
      {(isSubmitting || isPreparingEvidence || isDownloading || isSharing || isPreparingShare) && <ActionLoadingOverlay message={isPreparingEvidence ? "กำลังย่อและเตรียมรูปหลักฐาน..." : isSharing || isPreparingShare ? "กำลังเตรียมรูปสำหรับแชร์..." : isDownloading ? "กำลังสร้างไฟล์ใบเสร็จ..." : "กำลังบันทึกการเบิก..."} />}
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

      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
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
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Step 1</p>
                <h2 className="mt-1 text-lg font-bold">เลือกยุทโธปกรณ์</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                เลือกแล้ว {selectedItems.length} รายการ
              </span>
            </div>

            <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
              {data.inventory.length ? (
                data.inventory.map((item) => {
                  const isSelected = selected[item.inventoryId] !== undefined;
                  return (
                    <article
                      key={item.inventoryId}
                      className={`overflow-hidden rounded-2xl border transition ${
                        isSelected
                          ? "border-blue-400 bg-blue-50/80 shadow-md shadow-blue-100"
                          : "border-slate-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(item)}
                        className="flex w-full items-center gap-3 p-4 text-left"
                        aria-pressed={isSelected}
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                            item.requirePlate ? "bg-indigo-100 text-indigo-600" : "bg-sky-100 text-sky-600"
                          }`}
                        >
                          {item.requirePlate ? <Truck className="size-5" /> : <ClipboardList className="size-5" />}
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
                                value={selected[item.inventoryId]}
                                onChange={(event) => updateQuantity(item, event.target.value)}
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
                <select
                  value={borrowerCompanyId}
                  onChange={(event) => setBorrowerCompanyId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                >
                  <option value="">เลือกหน่วยงานปลายทาง</option>
                  {data.companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>

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
                  placeholder="ระบุวัตถุประสงค์หรือข้อมูลเพิ่มเติม (ถ้ามี)"
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
                    <span className="mt-1 block text-xs text-slate-500">รองรับรูปไม่เกิน 2 MB · ระบบย่อและบันทึกรูปลงประวัติ</span>
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
        <div className="mx-auto flex max-w-3xl items-center gap-4">
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

      {receipt && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-bold text-slate-800">ใบรับรองดิจิทัล</p>
                <p className="text-xs text-slate-500">บันทึกภาพเพื่อแชร์ผ่าน LINE</p>
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

            <div
              ref={receiptRef}
              style={{ background: "#ffffff", color: "#0f172a", padding: 24, borderRadius: 20, fontFamily: "Arial, sans-serif" }}
            >
              <div style={{ textAlign: "center", borderBottom: "2px solid #2563eb", paddingBottom: 16 }}>
                <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: 16, background: "#2563eb", color: "#ffffff", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>TEMS</div>
                <h2 style={{ margin: "12px 0 4px", fontSize: 20 }}>ใบเบิกยุทโธปกรณ์ดิจิทัล</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tactical Equipment Management System</p>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 18, fontSize: 13 }}>
                <p style={{ margin: 0 }}><strong>Tx_ID:</strong> {receipt.txId}</p>
                <p style={{ margin: 0 }}><strong>วันที่ทำรายการ:</strong> {formatThaiDate(receipt.date)}</p>
                <p style={{ margin: 0 }}><strong>ผู้ทำรายการ:</strong> {receipt.borrowerName}</p>
                <p style={{ margin: 0 }}><strong>หน่วยผู้ให้ยืม:</strong> {receipt.ownerCompanyName}</p>
                <p style={{ margin: 0 }}><strong>หน่วยผู้ยืม:</strong> {receipt.borrowerCompanyName}</p>
                <p style={{ margin: 0, color: "#dc2626" }}><strong>กำหนดส่งคืน:</strong> {formatThaiDate(receipt.dueDate)}</p>
              </div>
              <div style={{ marginTop: 18, borderTop: "1px solid #cbd5e1", paddingTop: 14 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>รายการที่เบิก</p>
                {receipt.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #e2e8f0", fontSize: 12 }}>
                    <span>{index + 1}. {item.name}{item.plateNumber ? ` (${item.plateNumber})` : ""}</span>
                    <strong>x{item.quantity}</strong>
                  </div>
                ))}
              </div>
              <p style={{ margin: "20px 0 0", textAlign: "center", color: "#64748b", fontSize: 10 }}>เอกสารนี้สร้างโดยระบบ TEMS โดยอัตโนมัติ</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={downloadReceipt} disabled={isDownloading || isSharing} className="flex h-12 items-center justify-center gap-1.5 rounded-full bg-blue-600 text-xs font-bold text-white shadow-lg shadow-blue-200 disabled:opacity-60"><Download className="size-4" />โหลด</button><button type="button" onClick={shareReceipt} disabled={isDownloading || isSharing || shareAsset?.id !== receipt.txId} className="flex h-12 items-center justify-center gap-1.5 rounded-full bg-slate-700 text-xs font-bold text-white disabled:opacity-60"><Share2 className="size-4" />{shareAsset?.id === receipt.txId ? "แชร์ภาพ" : "เตรียมภาพ..."}</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
