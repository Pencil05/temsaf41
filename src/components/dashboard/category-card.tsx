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

export function CategoryCard({ category }: { category: DashboardCategory }) {
  return (
    <Link
      href={`/user/inventory/${encodeURIComponent(category.name)}`}
      className="group rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_14px_30px_rgba(37,99,235,0.14)] focus:outline-none focus:ring-4 focus:ring-blue-100"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
        <CategoryIcon categoryName={category.name} />
      </span>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-800">{category.name}</p>
      <p className="mt-2 text-xs text-slate-500">
        รวม <span className="font-bold text-blue-600">{category.quantity.toLocaleString("th-TH")}</span> รายการ
      </p>
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
