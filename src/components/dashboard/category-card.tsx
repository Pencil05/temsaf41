import Link from "next/link";
import { Boxes, Crosshair, Shield, Truck } from "lucide-react";
import type { DashboardCategory } from "@/lib/google-sheets";

function CategoryIcon({ categoryName }: { categoryName: string }) {
  const category = categoryName.toLowerCase();
  if (category.includes("ยานพาหนะ") || category.includes("vehicle")) return <Truck className="size-5" aria-hidden="true" />;
  if (category.includes("สรรพาวุธ") || category.includes("ammunition")) return <Shield className="size-5" aria-hidden="true" />;
  if (category.includes("อาวุธ") || category.includes("weapon")) return <Crosshair className="size-5" aria-hidden="true" />;
  return <Boxes className="size-5" aria-hidden="true" />;
}

function categoryTone(categoryName: string) {
  const category = categoryName.toLowerCase();
  if (category.includes("ยานพาหนะ") || category.includes("vehicle")) return "bg-cyan-50 text-cyan-700 group-hover:bg-cyan-600 group-active:bg-cyan-600";
  if (category.includes("สรรพาวุธ") || category.includes("ammunition")) return "bg-amber-50 text-amber-700 group-hover:bg-amber-500 group-active:bg-amber-500";
  if (category.includes("อาวุธ") || category.includes("weapon")) return "bg-sky-50 text-sky-700 group-hover:bg-sky-600 group-active:bg-sky-600";
  return "bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-active:bg-indigo-600";
}

export function CategoryCard({ category, borrowed = false }: { category: DashboardCategory; borrowed?: boolean }) {
  return (
    <Link
      href={`/user/inventory/${encodeURIComponent(category.name)}`}
      className={`group rounded-2xl border bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(37,99,235,0.14)] focus:outline-none focus:ring-4 ${borrowed ? "border-amber-200 hover:border-amber-400 focus:ring-amber-100" : "border-slate-100 hover:border-blue-200 focus:ring-blue-100"}`}
    >
      <span className={`grid size-10 place-items-center rounded-xl transition group-hover:text-white group-active:scale-110 group-active:text-white ${categoryTone(category.name)}`}>
        <CategoryIcon categoryName={category.name} />
      </span>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-800">{category.name}</p>
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-medium text-slate-500">{borrowed ? "ยืมมา" : "รวมทั้งหมด"}</span>
        <span className={`text-3xl font-bold leading-none tracking-tight ${borrowed ? "text-amber-600" : "text-blue-600"}`}>
          {category.quantity.toLocaleString("th-TH")}
        </span>
      </div>
    </Link>
  );
}

export function EmptyCategories() {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
      ยังไม่พบข้อมูลยุทโธปกรณ์ของหน่วยงานนี้
    </div>
  );
}
