"use client";

import { AlertTriangle, CheckCircle2, Download, FileImage, FileText, PackagePlus, Plus, RotateCcw, Trash2, UploadCloud, Wrench, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { EquipmentImage } from "@/components/equipment/equipment-image";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { CompactSelect } from "@/components/ui/compact-select";
import { compressImageForSheet, receiptCanvas } from "@/lib/client-media";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import { fetchWithRetry } from "@/lib/client-request";
import type { DashboardActionData } from "@/lib/inventory-action-service";

type Mode = "return" | "defect" | null;

export function DashboardActions({ data, initialMode = null, showBorrow = true, showReturn = true }: { data: DashboardActionData; initialMode?: Mode; showBorrow?: boolean; showReturn?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [returnSelections, setReturnSelections] = useState<Record<string, number | "">>({});
  const [returnReferenceId, setReturnReferenceId] = useState("");
  const [returnEvidenceName, setReturnEvidenceName] = useState("");
  const [returnEvidenceImage, setReturnEvidenceImage] = useState("");
  const [isPreparingReturnEvidence, setIsPreparingReturnEvidence] = useState(false);
  const [defectKey, setDefectKey] = useState("");
  const [defectSelections, setDefectSelections] = useState<Record<string, number>>({});
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
  const [requestMessage, setRequestMessage] = useState("กำลังส่งข้อมูลเข้าสู่ระบบ");
  const returnReceiptRef = useRef<HTMLDivElement>(null);
  const { clearDraft } = useUnsavedDraft({ storageKey: `tems-dashboard-actions:${data.companyName}`, value: { mode, returnSelections, returnEvidenceName, returnEvidenceImage, defectKey, defectSelections, quantity, note, defectEvidenceName, defectEvidenceImage }, dirty: Boolean(mode && (Object.keys(returnSelections).length || returnEvidenceImage || defectKey || Object.keys(defectSelections).length || note || defectEvidenceImage)), onRestore: (draft) => { setMode(draft.mode || null); setReturnSelections(draft.returnSelections || {}); setReturnEvidenceName(draft.returnEvidenceName || ""); setReturnEvidenceImage(draft.returnEvidenceImage || ""); setDefectKey(draft.defectKey || ""); setDefectSelections(draft.defectSelections || {}); setQuantity(draft.quantity || 1); setNote(draft.note || ""); setDefectEvidenceName(draft.defectEvidenceName || ""); setDefectEvidenceImage(draft.defectEvidenceImage || ""); } });

  const defect = data.defects.find((item) => `${item.sourceType}:${item.sourceId}` === defectKey);
  const selectedDefects = data.defects.filter((item) => defectSelections[`${item.sourceType}:${item.sourceId}`] !== undefined);
  const selectedReturns = data.returns.filter((item) => returnSelections[item.transactionId] !== undefined);
  const selectedOwnerId = selectedReturns[0]?.ownerCompanyId || "";
  const selectedOwnerName = selectedReturns[0]?.ownerCompanyName || "";
  const selectedSelfUse = selectedReturns.length > 0 && selectedReturns.every((item) => item.selfUse);
  const returnGroups = [...data.returns.reduce((groups, item) => { const records = groups.get(item.ownerCompanyId) || []; records.push(item); groups.set(item.ownerCompanyId, records); return groups; }, new Map<string, DashboardActionData["returns"]>())];

  function closeMode() {
    setMode(null);
    if (searchParams.get("action")) {
      router.replace(pathname, { scroll: false });
    }
  }

  function chooseReturn(id: string) {
    const item = data.returns.find((entry) => entry.transactionId === id);
    if (!item) return;
    setReturnSelections((current) => {
      const next = { ...current };
      if (next[id] !== undefined) delete next[id];
      else if (!selectedOwnerId || item.ownerCompanyId === selectedOwnerId) next[id] = item.quantity;
      return next;
    });
  }

  function openReturn() {
    setReturnEvidenceName("");
    setReturnEvidenceImage("");
    setReturnSelections({});
    setReturnReferenceId("");
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

  function updateReturnQuantity(transactionId: string, rawValue: string) {
    if (rawValue === "") {
      setReturnSelections((current) => ({ ...current, [transactionId]: "" }));
      return;
    }
    const maximum = data.returns.find((item) => item.transactionId === transactionId)?.quantity || 1;
    const nextQuantity = Math.floor(Number(rawValue) || 1);
    setReturnSelections((current) => ({ ...current, [transactionId]: Math.max(1, Math.min(maximum, nextQuantity)) }));
  }

  function chooseDefect(key: string) {
    setDefectKey(key);
    setQuantity(1);
  }

  function openDefect() {
    setDefectEvidenceName("");
    setDefectEvidenceImage("");
    setDefectKey("");
    setDefectSelections({});
    setMode("defect");
  }

  function addDefectSelection() {
    const requested = Number(quantity);
    if (!defect || requested < 1 || requested > defect.maximum) { setMessage({ type: "error", text: "กรุณาเลือกยุทโธปกรณ์และตรวจสอบจำนวน" }); return; }
    const key = `${defect.sourceType}:${defect.sourceId}`;
    setDefectSelections((current) => ({ ...current, [key]: requested }));
    setDefectKey(""); setQuantity(1);
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
    const invalid = selectedReturns.find((item) => Number(returnSelections[item.transactionId]) < 1 || Number(returnSelections[item.transactionId]) > item.quantity);
    if (!selectedReturns.length || invalid || new Set(selectedReturns.map((item) => item.ownerCompanyId)).size !== 1) {
      setMessage({ type: "error", text: "กรุณาตรวจสอบรายการและจำนวนที่ต้องการคืน" });
      return;
    }

    setReturnReview(true);
  }

  async function confirmReturn() {
    if (!selectedReturns.length) return;
    setSubmitting(true);
    try {
      const response = await fetchWithRetry("/api/return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: selectedReturns.map((item) => ({ transactionId: item.transactionId, quantity: Number(returnSelections[item.transactionId]) })), evidenceImage: returnEvidenceImage }) }, { onProgress: (progress) => setRequestMessage(progress.message) });
      const payload = (await response.json()) as { error?: string; returnGroupId?: string };
      if (!response.ok) throw new Error(payload.error || "คืนรายการไม่สำเร็จ");
      clearDraft();
      setReturnCompleted(true);
      setReturnReferenceId(payload.returnGroupId || `RET-${Date.now()}`);
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "คืนรายการไม่สำเร็จ" }); return; }
    finally { setSubmitting(false); }
    setReturnCompletedAt(new Date().toISOString());
    setMessage({ type: "success", text: "คืนยุทโธปกรณ์เรียบร้อยแล้ว" });
  }

  async function downloadReturnReceipt(format: "jpg" | "pdf") {
    if (!returnReceiptRef.current || !selectedReturns.length) return;
    setReceiptDownloading(true);
    try {
      const image = await receiptCanvas(returnReceiptRef.current);
      if (format === "jpg") {
        const link = document.createElement("a");
        link.download = `${returnReferenceId || "RETURN"}.jpg`;
        link.href = image.toDataURL("image/jpeg", 0.95);
        link.click();
      } else {
        const { jsPDF } = await import("jspdf");
        const document = new jsPDF();
        const width = 186;
        document.addImage(image.toDataURL("image/jpeg", 0.95), "JPEG", 12, 12, width, image.height * width / image.width);
        document.save(`${returnReferenceId || "RETURN"}.pdf`);
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
    setReturnSelections({});
    closeMode();
    router.refresh();
  }

  usePopupDismiss(mode !== null && !returnReview, closeMode);
  usePopupDismiss(returnReview && !returnDownloadOpen, () => {
    if (returnCompleted) closeCompletedReturn();
    else setReturnReview(false);
  });
  usePopupDismiss(returnDownloadOpen, () => setReturnDownloadOpen(false));
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(null), 3000); return () => window.clearTimeout(timeout); }, [message]);

  async function submitDefect(event: FormEvent) {
    event.preventDefault();
    if (!selectedDefects.length) {
      setMessage({ type: "error", text: "กรุณาเพิ่มยุทโธปกรณ์ที่ชำรุดอย่างน้อย 1 รายการ" });
      return;
    }
    if (!defectEvidenceImage) {
      setMessage({ type: "error", text: "กรุณาแนบรูปหลักฐานการแจ้งเสีย" });
      return;
    }

    setSubmitting(true);

    const completed: string[] = [];
    try {
      for (const [index, item] of selectedDefects.entries()) {
        const key = `${item.sourceType}:${item.sourceId}`;
        const response = await fetchWithRetry("/api/defect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: item.sourceType, sourceId: item.sourceId, quantity: defectSelections[key], note, evidenceImage: defectEvidenceImage }) }, { onProgress: (progress) => setRequestMessage(`รายการ ${index + 1}/${selectedDefects.length} · ${progress.message}`) });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || `แจ้งเสียรายการ ${item.name} ไม่สำเร็จ`);
        completed.push(key);
      }
      clearDraft();
    } catch (error) { setDefectSelections((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !completed.includes(key)))); setMessage({ type: "error", text: `${completed.length ? `บันทึกแล้ว ${completed.length} รายการ · ` : ""}${error instanceof Error ? error.message : "แจ้งเสียไม่สำเร็จ"}` }); setSubmitting(false); return; }
    setSubmitting(false);

    closeMode();
    setMessage({ type: "success", text: `บันทึกการแจ้งเสีย ${selectedDefects.length} รายการเรียบร้อยแล้ว` });
    router.refresh();
  }

  return (
    <>
      {(submitting || isPreparingDefectEvidence || isPreparingReturnEvidence) && (
              <ActionLoadingOverlay message={isPreparingDefectEvidence || isPreparingReturnEvidence ? "กำลังเตรียมรูปหลักฐาน..." : requestMessage} />
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

      <section className={`mt-6 grid gap-3 ${showBorrow && showReturn ? "grid-cols-1 sm:grid-cols-3" : showBorrow || showReturn ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {showBorrow && <Link href="/user/borrow" className="group rounded-[22px] border border-blue-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-blue-300">
          <span className="grid size-11 place-items-center rounded-2xl bg-blue-100 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white group-active:bg-blue-600 group-active:text-white"><PackagePlus className="size-5" /></span>
          <span className="mt-3 block font-bold text-slate-800">เบิกยุทโธปกรณ์</span>
          <span className="mt-1 block text-xs text-slate-500">เลือกเบิกได้หลายรายการ</span>
        </Link>}
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
            <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">เลือกรายการที่ต้องการคืน</span><span className="text-xs font-semibold text-emerald-700">เลือกแล้ว {selectedReturns.length} รายการ</span></div><p className="mb-3 text-xs leading-5 text-slate-500">คืนพร้อมกันได้หลายรายการ แต่ต้องเป็นยุทโธปกรณ์ที่ยืมมาจากกองร้อยเจ้าของเดียวกัน</p><div className="max-h-[42dvh] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">{returnGroups.map(([ownerId, records]) => <section key={ownerId}><div className="sticky top-0 z-10 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">คืนไปยัง {records[0]?.ownerCompanyName}</div><div className="mt-2 space-y-2">{records.map((item) => { const checked = returnSelections[item.transactionId] !== undefined; const disabled = Boolean(selectedOwnerId && selectedOwnerId !== item.ownerCompanyId); return <div key={item.transactionId} className={`rounded-2xl border bg-white p-3 transition ${checked ? "border-emerald-400 shadow-md" : "border-slate-200"} ${disabled ? "opacity-45" : "active:scale-[0.99]"}`}><div className="flex items-center gap-3"><button type="button" disabled={disabled} onClick={() => chooseReturn(item.transactionId)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 p-1"><EquipmentImage name={item.name} src={item.picture || undefined} className="size-full" /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{item.name}</span>{item.plateNumber && <span className="block truncate font-mono text-xs font-semibold text-violet-700">Serial/ทะเบียน {item.plateNumber}</span>}<span className="block text-xs text-slate-500">คงค้าง {item.quantity.toLocaleString("th-TH")} {item.selfUse ? "· ใช้งานภายในหน่วย" : ""}</span></span><span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{checked && <CheckCircle2 className="size-4" />}</span></button></div>{checked && <label className="mt-3 block border-t border-slate-100 pt-3"><span className="mb-1 flex justify-between text-xs font-semibold"><span>จำนวนที่คืน</span><span>สูงสุด {item.quantity}</span></span><input type="number" min={1} max={item.quantity} value={returnSelections[item.transactionId]} onChange={(event) => updateReturnQuantity(item.transactionId, event.target.value)} onBlur={() => { if (returnSelections[item.transactionId] === "") setReturnSelections((current) => ({ ...current, [item.transactionId]: 1 })); }} className="h-10 w-full rounded-xl border border-slate-200 px-3" /></label>}</div>; })}</div></section>)}</div></div>

            <div>
              <span className="mb-2 block text-sm font-semibold">{selectedSelfUse ? "คืนเข้าคลังเดิม" : "กองร้อยปลายทางที่รับคืน"}</span>
              <div className="flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 font-semibold text-emerald-800">
                {selectedOwnerName || "เลือกรายการที่ต้องการคืนก่อน"}
              </div>
              <span className="mt-2 block text-xs text-slate-500">
                {selectedSelfUse ? "รายการนี้เป็นการเบิกใช้งานภายในหน่วย ระบบจะคืนยอดกลับเข้าคลังเดิม" : "ระบบล็อกให้ทุกรายการในใบคืนฉบับเดียวกันส่งกลับกองร้อยเจ้าของเดียวกัน"}
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
              <CompactSelect value={defectKey} onChange={chooseDefect} searchable required placeholder="พิมพ์ค้นหาแล้วเลือกรายการ" options={data.defects.map((item) => ({ value: `${item.sourceType}:${item.sourceId}`, label: item.name, description: `${item.label} · พร้อมใช้ ${item.maximum.toLocaleString("th-TH")}`, image: item.picture || undefined }))} />
            </label>

            {defect && <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-3"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1"><EquipmentImage name={defect.name} src={defect.picture || undefined} className="size-full" /></span><span className="min-w-0"><span className="block truncate font-bold">{defect.name}</span><span className="mt-1 block text-xs font-semibold text-orange-700">{defect.plateNumber ? `ทะเบียน/หมายเลข ${defect.plateNumber}` : `พร้อมแจ้งเสียสูงสุด ${defect.maximum.toLocaleString("th-TH")}`}</span></span></div>}

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

            <button type="button" onClick={addDefectSelection} disabled={!defect} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-100 font-bold text-orange-800 disabled:opacity-40"><Plus className="size-4" />เพิ่มเข้ารายการแจ้งเสีย</button>
            {selectedDefects.length > 0 && <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-orange-200 bg-orange-50/60 p-2">{selectedDefects.map((item) => { const key = `${item.sourceType}:${item.sourceId}`; return <div key={key} className="flex items-center gap-3 rounded-xl bg-white p-2.5"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50"><EquipmentImage name={item.name} src={item.picture || undefined} className="size-full" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.name}</span><span className="text-xs text-orange-700">จำนวน {defectSelections[key]}{item.plateNumber ? ` · ${item.plateNumber}` : ""}</span></span><button type="button" onClick={() => setDefectSelections((current) => Object.fromEntries(Object.entries(current).filter(([savedKey]) => savedKey !== key)))} className="grid size-9 place-items-center rounded-lg bg-red-50 text-red-600"><Trash2 className="size-4" /></button></div>; })}</div>}

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

      {returnReview && selectedReturns.length > 0 && (
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
              referenceId={returnCompleted ? returnReferenceId : "รอยืนยันการบันทึก"}
              status={returnCompleted ? "คืนแล้ว" : "รอยืนยันการคืน"}
              date={returnCompletedAt || new Date().toISOString()}
              operatorName={data.userName}
              contactPhone={data.contactPhone}
              contactEmail={data.contactEmail}
              ownerCompanyName={data.companyName}
              borrowerCompanyName={selectedOwnerName}
              note={selectedSelfUse ? "คืนยุทโธปกรณ์จากการใช้งานภายในหน่วยเข้าคลังเดิม" : "คืนยุทโธปกรณ์หลายรายการไปยังกองร้อยเจ้าของเดิม"}
              evidenceImage={returnEvidenceImage}
              items={selectedReturns.map((item) => ({ name: item.name, quantity: Number(returnSelections[item.transactionId]), plateNumber: item.plateNumber || undefined }))}
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

      {returnDownloadOpen && returnCompleted && selectedReturns.length > 0 && (
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
