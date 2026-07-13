"use client";

import { AlertTriangle, CheckCircle2, RotateCcw, Wrench, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ReceiptDocument } from "@/components/receipt/receipt-document";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import type { DashboardActionData } from "@/lib/inventory-action-service";

type Mode = "return" | "defect" | null;

export function DashboardActions({ data, initialMode = null }: { data: DashboardActionData; initialMode?: Mode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [transactionId, setTransactionId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState<number | "">(1);
  const [defectKey, setDefectKey] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnReview, setReturnReview] = useState(false);

  const defect = data.defects.find((item) => `${item.sourceType}:${item.sourceId}` === defectKey);
  const selectedReturn = data.returns.find((item) => item.transactionId === transactionId);

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

  function submitReturn(event: FormEvent) {
    event.preventDefault();
    const requestedQuantity = Number(returnQuantity);

    if (!selectedReturn || requestedQuantity < 1 || requestedQuantity > selectedReturn.quantity) {
      setMessage({ type: "error", text: "กรุณาตรวจสอบรายการและจำนวนที่ต้องการคืน" });
      return;
    }

    closeMode();
    setReturnReview(true);
  }

  async function confirmReturn() {
    if (!selectedReturn) return;

    const requestedQuantity = Number(returnQuantity);
    setSubmitting(true);

    const response = await fetch("/api/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, quantity: requestedQuantity }),
    });

    const payload = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setMessage({ type: "error", text: payload.error || "คืนรายการไม่สำเร็จ" });
      return;
    }

    setReturnReview(false);
    setMessage({ type: "success", text: "คืนยุทโธปกรณ์เรียบร้อยแล้ว" });
    router.refresh();
  }

  async function submitDefect(event: FormEvent) {
    event.preventDefault();
    const requestedQuantity = Number(quantity);

    if (!defect || requestedQuantity < 1 || requestedQuantity > defect.maximum) {
      setMessage({ type: "error", text: "กรุณาตรวจสอบรายการและจำนวน" });
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
      {submitting && (
        <ActionLoadingOverlay message={mode === "return" ? "กำลังคืนยุทโธปกรณ์และปรับยอดคลัง..." : "กำลังบันทึกการแจ้งเสีย..."} />
      )}

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

      <section className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode("defect")}
          className="group rounded-[22px] border border-orange-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-orange-200"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-orange-100 text-orange-600 transition group-hover:bg-orange-600 group-hover:text-white group-active:bg-orange-600 group-active:text-white">
            <Wrench className="size-5" />
          </span>
          <span className="mt-3 block font-bold text-slate-800">แจ้งเสีย</span>
          <span className="mt-1 block text-xs text-slate-500">รายงานรายการชำรุด</span>
        </button>

        <button
          onClick={() => setMode("return")}
          className="group rounded-[22px] border border-emerald-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-emerald-200"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-600 group-hover:text-white group-active:bg-emerald-600 group-active:text-white">
            <RotateCcw className="size-5" />
          </span>
          <span className="mt-3 block font-bold text-slate-800">คืนยุทโธปกรณ์</span>
          <span className="mt-1 block text-xs text-slate-500">คืนรายการที่กำลังยืม</span>
        </button>
      </section>

      {mode === "return" && (
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
                    {item.name} จำนวน {item.quantity}
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
              <span className="mb-2 block text-sm font-semibold">คืนไปยังหน่วยเจ้าของเดิม</span>
              <div className="flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 font-semibold text-emerald-800">
                {selectedReturn?.ownerCompanyName || "เลือกรายการที่ต้องการคืนก่อน"}
              </div>
              <span className="mt-2 block text-xs text-slate-500">
                ระบบกำหนดปลายทางจากรายการยืมโดยอัตโนมัติ ไม่สามารถเปลี่ยนหน่วยรับคืนได้
              </span>
            </div>

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
              <select
                value={defectKey}
                onChange={(event) => chooseDefect(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3"
                required
              >
                <option value="">เลือกรายการ</option>
                {data.defects.map((item) => (
                  <option key={`${item.sourceType}:${item.sourceId}`} value={`${item.sourceType}:${item.sourceId}`}>
                    {item.name} {item.label} สูงสุด {item.maximum}
                  </option>
                ))}
              </select>
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

            <Actions submitting={submitting} onCancel={closeMode} />
          </form>
        </Modal>
      )}

      {returnReview && selectedReturn && (
        <div className="popup-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
          <div className="popup-panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-slate-100 p-4 shadow-2xl sm:rounded-[30px]">
            <div className="mb-3 px-1">
              <p className="font-bold text-slate-800">ตรวจก่อนยืนยันการคืน</p>
              <p className="text-xs text-slate-500">ระบบจะยังไม่ปรับยอดคลังจนกว่าจะกดยืนยันครั้งสุดท้าย</p>
            </div>

            <ReceiptDocument
              title="สลิปตรวจสอบการคืนยุทโธปกรณ์"
              referenceId={selectedReturn.transactionId}
              status="รอยืนยันการคืน"
              date={new Date().toISOString()}
              operatorName={data.userName}
              ownerCompanyName={data.companyName}
              borrowerCompanyName={selectedReturn.ownerCompanyName}
              note="คืนไปยังหน่วยเจ้าของเดิม"
              items={[{ name: selectedReturn.name, quantity: Number(returnQuantity) }]}
            />

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
          </div>
        </div>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="popup-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
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
