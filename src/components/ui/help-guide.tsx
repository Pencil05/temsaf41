"use client";

import { BookOpen, CheckCircle2, HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePopupDismiss } from "@/hooks/use-popup-dismiss";

type Guide = { title: string; intro: string; steps: string[] };

const guides: Array<{ match: (pathname: string) => boolean; guide: Guide }> = [
  { match: (path) => path.includes("/borrow"), guide: { title: "วิธีเบิกยุทโธปกรณ์", intro: "เลือกได้หลายรายการ ระบบจะตรวจจำนวนอีกครั้งก่อนบันทึก", steps: ["เลือกกองร้อยปลายทางก่อน เพื่อป้องกันการส่งต่อของยืมมา", "ค้นหา เลือกรายการ และกำหนดจำนวน", "กำหนดวันคืน แนบหลักฐาน และตรวจสลิปก่อนยืนยัน"] } },
  { match: (path) => path.includes("/history"), guide: { title: "วิธีดูประวัติ", intro: "ประวัติเดิมจะไม่เปลี่ยนตามรายการภายหลัง", steps: ["เลือกวันที่หรือค้นหารายการที่ต้องการ", "แตะแถวเพื่อเปิดใบเสร็จ", "ดาวน์โหลด ทำรายการซ้ำ หรือ Undo ภายใน 5 นาทีได้"] } },
  { match: (path) => path.includes("/maintenance"), guide: { title: "วิธีแจ้งและติดตามการซ่อม", intro: "แจ้งเสียได้เฉพาะทรัพย์สินของกองร้อยตนเอง", steps: ["กดแจ้งเสียและเลือกอุปกรณ์", "ระบุจำนวน อาการ และแนบรูปหลักฐาน", "ติดตามสถานะตรวจสอบ ซ่อม หรือจำหน่ายจากตาราง"] } },
  { match: (path) => path.includes("/my-items"), guide: { title: "ศูนย์รายการของฉัน", intro: "รวมงานที่ต้องติดตามไว้ในหน้าเดียว", steps: ["ตรวจรายการใกล้ครบกำหนดและเกินกำหนด", "เปิดคืนอุปกรณ์จากรายการที่กำลังถือครอง", "ดูรายการโปรดและรายการที่ใช้งานล่าสุด"] } },
  { match: (path) => path.includes("/settings"), guide: { title: "ตั้งค่าโปรไฟล์", intro: "ข้อมูลติดต่อจะปรากฏในใบเสร็จของรายการที่คุณเป็นผู้ดำเนินการ", steps: ["อัปเดตเบอร์โทร Gmail และรูปโปรไฟล์", "กดบันทึกและรอข้อความยืนยัน", "ใช้เมนูเปลี่ยนรหัสผ่านเมื่อจำเป็น"] } },
  { match: () => true, guide: { title: "คู่มือใช้งาน TEMS", intro: "ใช้เมนูค้นหาด้านบนเพื่อเข้าถึงทุกส่วนได้รวดเร็ว", steps: ["ตรวจรายการของฉันและแจ้งเตือนก่อนเริ่มงาน", "เลือก เบิก คืน หรือแจ้งเสียจากเมนูหลัก", "ตรวจข้อมูลบนสลิปทุกครั้งก่อนยืนยัน"] } },
];

export function HelpGuide({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const guide = guides.find((item) => item.match(pathname))?.guide || guides.at(-1)!.guide;
  usePopupDismiss(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="popup-backdrop fixed inset-0 z-[260] grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[3px] sm:p-6" role="dialog" aria-modal="true" aria-labelledby="help-guide-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="help-guide-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.35)] sm:max-h-[min(42rem,calc(100dvh-3rem))]">
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 p-5 text-white sm:p-6">
          <span className="absolute -right-10 -top-12 size-36 rounded-full border-[22px] border-white/10" />
          <div className="relative flex items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/15 shadow-inner"><BookOpen className="size-6" /></span>
            <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 active:bg-white/30" aria-label="ปิดคู่มือ"><X className="size-5" /></button>
          </div>
          <div className="relative mt-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">Quick Guide</p><h2 id="help-guide-title" className="mt-1 text-2xl font-bold">{guide.title}</h2><p className="mt-2 text-sm leading-6 text-blue-100">{guide.intro}</p></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-4 sm:p-5">
          <ol className="space-y-3">{guide.steps.map((step, index) => <li key={step} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-200">{index + 1}</span><span className="pt-1 text-sm font-medium leading-6 text-slate-700">{step}</span></li>)}</ol>
          <p className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />ระบบจะถามยืนยันก่อนแก้ไขข้อมูลสำคัญเสมอ</p>
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white p-4"><button type="button" onClick={() => setOpen(false)} className="h-11 w-full rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">เข้าใจแล้ว</button></footer>
      </section>
    </div>,
    document.body,
  ) : null;

  return <><button type="button" onClick={() => setOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="เปิดคู่มือหน้านี้" title="คู่มือหน้านี้"><HelpCircle className="size-5" /></button>{modal}</>;
}
