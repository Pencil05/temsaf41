import { AlertTriangle, BellRing, Clock3 } from "lucide-react";
import type { DashboardActivity } from "@/lib/google-sheets";

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
        <article
          key={activity.id}
          className={`flex gap-3 rounded-2xl border p-4 shadow-sm ${
            activity.isOverdue
              ? "border-red-200 bg-red-50"
              : "border-slate-100 bg-white"
          }`}
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              activity.isOverdue ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600"
            }`}
          >
            {activity.isOverdue ? (
              <AlertTriangle className="size-5" aria-hidden="true" />
            ) : (
              <BellRing className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-6 text-slate-700">{activity.message}</p>
            <p className={`mt-1 flex items-center gap-1 text-xs ${activity.isOverdue ? "text-red-600" : "text-slate-400"}`}>
              <Clock3 className="size-3.5" aria-hidden="true" />
              {activity.isOverdue ? "เกินกำหนดส่งคืน" : "รายการล่าสุด"}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
