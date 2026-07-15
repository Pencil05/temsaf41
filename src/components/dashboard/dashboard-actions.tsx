"use client";

import { AlertTriangle, CheckCircle2, Download, FileImage, FileText, RotateCcw, UploadCloud, Wrench, X } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { compressImageForSheet, receiptCanvas } from "@/lib/client-media";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";
import type { DashboardActionData } from "@/lib/inventory-action-service";

type Mode = "return" | "defect" | null;

export function DashboardActions({ data, initialMode = null, showReturn = true }: { data: DashboardActionData; initialMode?: Mode; showReturn?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [transactionId, setTransactionId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState<number | "">(1);
  const [returnEvidenceName, setReturnEvidenceName] = useState("");
  const [returnEvidenceImage, setReturnEvidenceImage] = useState("");
  const [isPreparingReturnEvidence, setIsPreparingReturnEvidence] = useState(false);
  const [defectKey, setDefectKey] = useState("");
  const [defectSearch, setDefectSearch] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [note, setNote] = useState("");
  const [defectEvidenceName, setDefectEvidenceName] = useState("");
  const [defectEvidenceImage, setDefectEvidenceImage] = useState("");
  const [isPreparingDefectEvidence, setIsPreparingDefectEvidence] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnReview, setReturnReview] = useState(false);
  const [returnCompleted, setReturnCompleted] = useState(false);
  const [returnCompletedAt, setReturnCompletedAt] = useState("");
  const [receiptDownloading, setReceiptDownloading] = useState(false);
  const [returnDownloadOpen, setReturnDownloadOpen] = useState(false);
  const returnReceiptRef = useRef<HTMLDivElement>(null);

  const defect = data.defects.find((item) => `${item.sourceType}:${item.sourceId}` === defectKey);
  const selectedReturn = data.returns.find((item) => item.transactionId === transactionId);

  usePopupDismiss(mode !== null && !returnReview, closeMode);
  usePopupDismiss(returnReview && !returnDownloadOpen, () => {
    if (returnCompleted) closeCompletedReturn();
    else setReturnReview(false);
  });
  usePopupDismiss(returnDownloadOpen, () => setReturnDownloadOpen(false));
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(null), 3000); return () => window.clearTimeout(timeout); }, [message]);

  function closeMode() {
    setMode(null);
    if (searchParams.get("action")) {
      router.replace(pathname, { scroll: false });
    }
  }

  function chooseReturn(id: string) {
    setTransactionId(id);
    setReturnQuantity(1);
  }

  function openReturn() {
    setReturnEvidenceName("");
    setReturnEvidenceImage("");
    setMode("return");
  }

  async function handleReturnEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "กรุณาเลือกรูปหลักฐานขนาดไม่เกิน 5 MB" });
      event.target.value = "";
      return;
    }
    setIsPreparingReturnEvidence(true);
    try {
      setReturnEvidenceImage(await compressImageForSheet(file));
      setReturnEvidenceName(file.name);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "ไม่สามารถเตรียมรูปหลักฐานได้" });
    } finally {
      setIsPreparingReturnEvidence(false);
    }
  }

  function updateReturnQuantity(rawValue: string) {
    if (rawValue === "") {
      setReturnQuantity("");
      return;
    }

    const maximum = selectedReturn?.quantity || 1;
    const nextQuantity = Math.floor(Number(rawValue) || 1);
    setReturnQuantity(Math.max(1, Math.min(maximum, nextQuantity)));
  }

  function chooseDefect(key: string) {
    setDefectKey(key);
    setQuantity(1);
  }

  function openDefect() {
    setDefectEvidenceName("");
    setDefectEvidenceImage("");
    setDefectSearch("");
    setDefectKey("");
    setMode("defect");
  }

  async function handleDefectEvidence(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "กรุณาเลือกรูปหลักฐานขนาดไม่เกิน 5 MB" });
      event.target.value = "";
      return;
    }
    setIsPreparingDefectEvidence(true);
    try {
      setDefectEvidenceImage(await compressImageForSheet(file));
      setDefectEvidenceName(file.name);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "ไม่สามารถเตรียมรูปหลักฐานได้" });
    } finally {
      setIsPreparingDefectEvidence(false);
    }
  }

  function submitReturn(event: FormEvent) {
    event.preventDefault();
    const requestedQuantity = Number(returnQuantity);

    if (!selectedReturn || requestedQuantity < 1 || requestedQuantity > selectedReturn.quantity) {
      setMessage({ type: "error", text: "กรุณาตรวจสอบรายการและจำนวนที่ต้องการคืน" });
      return;
    }

    setReturnReview(true);
  }

  async function confirmReturn() {
    if (!selectedReturn) return;

    const requestedQuantity = Number(returnQuantity);
    setSubmitting(true);

    const response = await fetch("/api/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, quantity: requestedQuantity, evidenceImage: returnEvidenceImage }),
    });

    const payload = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setMessage({ type: "error", text: payload.error || "คืนรายการไม่สำเร็จ" });
      return;
    }

    setReturnCompleted(true);
    setReturnCompletedAt(new Date().toISOString());
    setMessage({ type: "success", text: "คืนยุทโธปกรณ์เรียบร้อยแล้ว" });
  }

  async function downloadReturnReceipt(format: "jpg" | "pdf") {
    if (!returnReceiptRef.current || !selectedReturn) return;
    setReceiptDownloading(true);
    try {
      const image = await receiptCanvas(returnReceiptRef.current);
      if (format === "jpg") {
        const link = document.createElement("a");
        link.download = `RETURN-${selectedReturn.transactionId}.jpg`;
        link.href = image.toDataURL("image/jpeg", 0.95);
        link.click();
      } else {
        const { jsPDF } = await import("jspdf");
        const document = new jsPDF();
        const width = 186;
        document.addImage(image.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, image.height * width / image.width);
        document.save(`RETURN-${selectedReturn.transactionId}.pdf`);
      }
      setReturnDownloadOpen(false);
    } catch {
      setMessage({ type: "error", text: "ไม่สามารถสร้างไฟล์ใบเสร็จได้ กรุณาลองใหม่อีกครั้ง" });
    } finally {
      setReceiptDownloading(false);
    }
  }

  function closeCompletedReturn() {
    setReturnReview(false);
    setReturnCompleted(false);
    setReturnCompletedAt("");
    setReturnDownloadOpen(false);
    setTransactionId("");
    closeMode();
    router.refresh();
  }

  async function submitDefect(event: FormEvent) {
    event.preventDefault();
    const requestedQuantity = Number(quantity);

    if (!defect || requestedQuantity < 1 || requestedQuantity > defect.maximum) {
      setMessage({ type: "error", text: "กรุณาตรวจสอบรายการและจำนวน" });
      return;
    }
    if (!defectEvidenceImage) {
      setMessage({ type: "error", text: "กรุณาแนบรูปหลักฐานการแจ้งเสีย" });
      return;
    }

    setSubmitting(true);

    const response = await fetch("/api/defect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: defect.sourceType,
        sourceId: defect.sourceId,
        quantity: requestedQuantity,
        note,
        evidenceImage: defectEvidenceImage,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setMessage({ type: "error", text: payload.error || "แจ้งเสียไม่สำเร็จ" });
      return;
    }

    closeMode();
    setMessage({ type: "success", text: "บันทึกการแจ้งเสียเรียบร้อยแล้ว" });
    router.refresh();
  }

  return (
    <>
      {(submitting || isPreparingDefectEvidence || isPreparingReturnEvidence) && (
          <ActionLoadingOverlay message={isPreparingDefectEvidence || isPreparingReturnEvidence ? "กำลังเตรียมรูปหลักฐาน..." : mode === "return" ? "กำลังคืนยุทโธปกรณ์และปรับยอดคลัง..." : "กำลังบันทึกการแจ้งเสีย..."} />
      )}
      {receiptDownloading && <ActionLoadingOverlay message="กำลังสร้างไฟล์ใบเสร็จ..." />}

      {message && (
        <div
          className={`fixed left-4 right-4 top-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl ${
            message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className={`mt-6 grid gap-3 ${showReturn ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          onClick={openDefect}
          className="group rounded-[22px] border border-orange-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-orange-200"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-orange-100 text-orange-600 transition group-hover:bg-orange-600 group-hover:text-white group-active:bg-orange-600 group-active:text-white">
            <Wrench className="size-5" />
          </span>
          <span className="mt-3 block font-bold text-slate-800">แจ้งเสีย</span>
          <span className="mt-1 block text-xs text-slate-500">รายงานรายการชำรุด</span>
        </button>

        {showReturn && <button
          onClick={openReturn}
          className="group rounded-[22px] border border-emerald-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-emerald-200"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-600 group-hover:text-white group-active:bg-emerald-600 group-active:text-white">
            <RotateCcw className="size-5" />
          </span>
          <span className="mt-3 block font-bold text-slate-800">คืนยุทโธปกรณ์</span>
          <span className="mt-1 block text-xs text-slate-500">คืนรายการที่กำลังยืม</span>
        </button>}
      </section>

      {mode === "return" && !returnReview && (
        <Modal title="คืนยุทโธปกรณ์" onClose={closeMode}>
          <form onSubmit={submitReturn} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">รายการที่ถือครอง</span>
              <select
                value={transactionId}
                onChange={(event) => chooseReturn(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3"
                required
              >
                <option value="">เลือกรายการ</option>
                {data.returns.map((item) => (
                  <option key={item.transactionId} value={item.transactionId}>
                    {item.name} จำนวน {item.quantity}{item.selfUse ? " · ใช้งานภายในหน่วย" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>จำนวนที่ต้องการคืน</span>
                <span className="text-xs font-medium text-slate-500">สูงสุด {selectedReturn?.quantity || 0}</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                max={selectedReturn?.quantity || 1}
                value={returnQuantity}
                onChange={(event) => updateReturnQuantity(event.target.value)}
                onBlur={() => {
                  if (returnQuantity === "") setReturnQuantity(1);
                }}
                disabled={!selectedReturn}
                className="h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-semibold">{selectedReturn?.selfUse ? "คืนเข้าคลังเดิม" : "คืนไปยังหน่วยเจ้าของเดิม"}</span>
              <div className="flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 font-semibold text-emerald-800">
                {selectedReturn?.ownerCompanyName || "เลือกรายการที่ต้องการคืนก่อน"}
              </div>
              <span className="mt-2 block text-xs text-slate-500">
                {selectedReturn?.selfUse ? "รายการนี้เป็นการเบิกใช้งานภายในหน่วย ระบบจะคืนยอดกลับเข้าคลังเดิม" : "ระบบกำหนดปลายทางจากรายการยืมโดยอัตโนมัติ ไม่สามารถเปลี่ยนหน่วยรับคืนได้"}
              </span>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-emerald-600">{returnEvidenceImage ? <Image src={returnEvidenceImage} alt="รูปหลักฐานการคืน" width={48} height={48} unoptimized className="size-12 object-cover" /> : <UploadCloud className="size-5" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{returnEvidenceName || "แนบรูปหลักฐานการคืน"}</span><span className="block text-xs text-slate-500">ไม่บังคับ · รูปไม่เกิน 5 MB</span></span>
              <input type="file" accept="image/*" onChange={handleReturnEvidence} className="sr-only" />
            </label>

            {!data.returns.length && (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">ไม่มีรายการที่กำลังยืม</p>
            )}

            <Actions submitting={submitting} onCancel={closeMode} />
          </form>
        </Modal>
      )}

      {mode === "defect" && (
        <Modal title="แจ้งยุทโธปกรณ์ชำรุด" onClose={closeMode}>
          <form onSubmit={submitDefect} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">รายการยุทโธปกรณ์</span>
              <input value={defectSearch} list="defect-equipment-options" onChange={(event) => { const next = event.target.value; setDefectSearch(next); const matched = data.defects.find((item) => `${item.name} · ${item.label} · สูงสุด ${item.maximum}` === next); if (matched) chooseDefect(`${matched.sourceType}:${matched.sourceId}`); else setDefectKey(""); }} placeholder="พิมพ์ค้นหาแล้วเลือกรายการ" autoComplete="off" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3" required />
              <datalist id="defect-equipment-options">{data.defects.map((item) => <option key={`${item.sourceType}:${item.sourceId}`} value={`${item.name} · ${item.label} · สูงสุด ${item.maximum}`} />)}</datalist>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">จำนวนที่ชำรุด</span>
              <input
                type="number"
                min={1}
                max={defect?.maximum || 1}
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    event.target.value === ""
                      ? ""
                      : Math.min(defect?.maximum || 1, Math.max(1, Math.floor(Number(event.target.value) || 1))),
                  )
                }
                onBlur={() => {
                  if (quantity === "") setQuantity(1);
                }}
                className="h-12 w-full rounded-xl border border-slate-200 px-3"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">รายละเอียดอาการ</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-3"
                placeholder="ระบุอาการหรือสาเหตุ"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-orange-600">
                {defectEvidenceImage ? <Image src={defectEvidenceImage} alt="รูปหลักฐานแจ้งเสีย" width={48} height={48} unoptimized className="size-12 object-cover" /> : <UploadCloud className="size-5" />}
              </span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{defectEvidenceName || "แนบรูปหลักฐานการแจ้งเสีย *"}</span><span className="block text-xs text-slate-500">จำเป็นต้องแนบรูป · ไม่เกิน 5 MB</span></span>
              <input type="file" accept="image/*" onChange={handleDefectEvidence} className="sr-only" required={!defectEvidenceImage} />
            </label>

            <Actions submitting={submitting} onCancel={closeMode} />
          </form>
        </Modal>
      )}

      {returnReview && selectedReturn && (
        <div className="popup-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) { if (returnCompleted) closeCompletedReturn(); else setReturnReview(false); } }}>
          <div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div className="mb-3 px-1">
              <p className="font-bold text-slate-800">{returnCompleted ? "ใบเสร็จการคืนยุทโธปกรณ์" : "ตรวจก่อนยืนยันการคืน"}</p>
              <p className="text-xs text-slate-500">{returnCompleted ? "ตรวจสอบและดาวน์โหลดใบเสร็จก่อนปิดหน้าต่าง" : "ระบบจะยังไม่ปรับยอดคลังจนกว่าจะกดยืนยันครั้งสุดท้าย"}</p>
            </div>

            {returnCompleted && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="size-5" />
                บันทึกการคืนเรียบร้อยแล้ว เลือกดาวน์โหลดใบเสร็จหรือกดปิด
              </div>
            )}

            <div ref={returnReceiptRef}>
            <ReceiptDocument
              title={returnCompleted ? "รายละเอียดการคืนยุทโธปกรณ์" : "สลิปตรวจสอบการคืนยุทโธปกรณ์"}
              referenceId={selectedReturn.transactionId}
              status={returnCompleted ? "คืนแล้ว" : "รอยืนยันการคืน"}
              date={returnCompletedAt || new Date().toISOString()}
              operatorName={data.userName}
              contactPhone={data.contactPhone}
              contactEmail={data.contactEmail}
              ownerCompanyName={data.companyName}
              borrowerCompanyName={selectedReturn.ownerCompanyName}
              note={selectedReturn.selfUse ? "คืนยุทโธปกรณ์จากการใช้งานภายในหน่วยเข้าคลังเดิม" : "คืนไปยังหน่วยเจ้าของเดิม"}
              evidenceImage={returnEvidenceImage}
              items={[{ name: selectedReturn.name, quantity: Number(returnQuantity) }]}
            />
            </div>

            {!returnCompleted && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setReturnReview(false);
                  setMode("return");
                }}
                disabled={submitting}
                className="h-12 rounded-full bg-white font-bold text-slate-600"
              >
                ย้อนกลับแก้ไข
              </button>
              <button
                type="button"
                onClick={confirmReturn}
                disabled={submitting}
                className="h-12 rounded-full bg-emerald-600 font-bold text-white disabled:opacity-60"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยันการคืน"}
              </button>
            </div>
            )}

            {returnCompleted && (
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={closeCompletedReturn} disabled={receiptDownloading} className="h-12 flex-1 rounded-full bg-white font-bold text-slate-600">ปิด</button>
                <button type="button" onClick={() => setReturnDownloadOpen(true)} disabled={receiptDownloading} className="grid size-12 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200 disabled:opacity-60" aria-label="ดาวน์โหลดใบเสร็จ"><Download className="size-5" /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {returnDownloadOpen && returnCompleted && selectedReturn && (
        <div className="popup-backdrop fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setReturnDownloadOpen(false); }}>
          <div className="popup-panel w-full max-w-xs rounded-[26px] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">ดาวน์โหลดใบเสร็จ</h3>
              <button type="button" onClick={() => setReturnDownloadOpen(false)} className="grid size-9 place-items-center rounded-full bg-slate-100"><X className="size-5 text-slate-500" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={() => downloadReturnReceipt("jpg")} disabled={receiptDownloading} className="flex w-full items-center gap-3 rounded-2xl bg-blue-50 p-4 text-left font-semibold text-blue-700 disabled:opacity-60"><FileImage className="size-5" />ดาวน์โหลดเป็นไฟล์รูป (JPG)</button>
              <button type="button" onClick={() => downloadReturnReceipt("pdf")} disabled={receiptDownloading} className="flex w-full items-center gap-3 rounded-2xl bg-red-50 p-4 text-left font-semibold text-red-700 disabled:opacity-60"><FileText className="size-5" />ดาวน์โหลดเป็นไฟล์ PDF</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="popup-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="popup-panel w-full max-w-md rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({ submitting, onCancel }: { submitting: boolean; onCancel: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button type="button" onClick={onCancel} className="h-12 rounded-full bg-slate-100 font-bold text-slate-600">
        ยกเลิก
      </button>
      <button type="submit" disabled={submitting} className="h-12 rounded-full bg-emerald-600 font-bold text-white disabled:opacity-60">
        {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
      </button>
    </div>
  );
}
