"use client";

import { BookOpen, CheckCircle2, HelpCircle, X } from "lucide-react";
import { useState } from "react";
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
  return <><button type="button" onClick={() => setOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm transition hover:bg-blue-50" aria-label="เปิดคู่มือหน้านี้" title="คู่มือหน้านี้"><HelpCircle className="size-5" /></button>{open && <div className="popup-backdrop fixed inset-0 z-[160] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="popup-panel w-full max-w-md rounded-t-[30px] bg-white p-5 sm:rounded-[30px]"><div className="flex items-start justify-between gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-blue-100 text-blue-700"><BookOpen className="size-6" /></span><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl bg-slate-100"><X className="size-5" /></button></div><h2 className="mt-4 text-xl font-bold">{guide.title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{guide.intro}</p><ol className="mt-5 space-y-3">{guide.steps.map((step, index) => <li key={step} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span><span className="text-sm leading-6 text-slate-700">{step}</span></li>)}</ol><p className="mt-4 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="size-4" />ระบบจะถามยืนยันก่อนแก้ไขข้อมูลสำคัญเสมอ</p></section></div>}</>;
}
