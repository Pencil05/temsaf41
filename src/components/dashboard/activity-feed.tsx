import { AlertTriangle, BellRing, ChevronRight, Clock3 } from "lucide-react";
import Link from "next/link";
import type { DashboardActivity } from "@/lib/google-sheets";

const activityTone = {
  borrow: {
    card: "border-amber-200 bg-amber-50/80 active:border-amber-400 active:bg-amber-100",
    icon: "bg-amber-100 text-amber-700",
    meta: "text-amber-700",
    label: "รายการเบิกยุทโธปกรณ์",
  },
  return: {
    card: "border-emerald-200 bg-emerald-50/80 active:border-emerald-400 active:bg-emerald-100",
    icon: "bg-emerald-100 text-emerald-700",
    meta: "text-emerald-700",
    label: "รายการคืนยุทโธปกรณ์",
  },
  defect: {
    card: "border-red-200 bg-red-50/80 active:border-red-400 active:bg-red-100",
    icon: "bg-red-100 text-red-700",
    meta: "text-red-700",
    label: "รายการแจ้งเสีย",
  },
  overdue: {
    card: "border-red-300 bg-red-50 active:border-red-500 active:bg-red-100",
    icon: "bg-red-100 text-red-700",
    meta: "text-red-700",
    label: "เกินกำหนดส่งคืน",
  },
  due: {
    card: "border-orange-200 bg-orange-50 active:border-orange-400 active:bg-orange-100",
    icon: "bg-orange-100 text-orange-700",
    meta: "text-orange-700",
    label: "ใกล้ครบกำหนดส่งคืน",
  },
};

export function ActivityFeed({ activities }: { activities: DashboardActivity[] }) {
  if (!activities.length) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        ยังไม่มีการแจ้งเตือนหรือความเคลื่อนไหวล่าสุด
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Link key={activity.id} href={activity.href} className={`group flex gap-3 rounded-2xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(37,99,235,0.16)] ${activityTone[activity.kind].card}`}>
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl shadow-sm transition group-hover:scale-110 group-active:scale-110 ${activityTone[activity.kind].icon}`}
          >
            {activity.isOverdue ? (
              <AlertTriangle className="size-5" aria-hidden="true" />
            ) : (
              <BellRing className="notification-bell size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-6 text-slate-700">{activity.message}</p>
            <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${activityTone[activity.kind].meta}`}>
              <Clock3 className="size-3.5" aria-hidden="true" />
              {activityTone[activity.kind].label}
            </p>
          </div>
          <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" />
        </Link>
      ))}
    </div>
  );
}
