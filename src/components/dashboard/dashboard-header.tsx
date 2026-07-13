import { UserRound } from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";

type DashboardHeaderProps = {
  user: SessionUser;
  companyName: string;
};

export function DashboardHeader({ user, companyName }: DashboardHeaderProps) {
  const fullName = [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 px-5 py-7 text-white shadow-[0_18px_40px_rgba(37,99,235,0.25)] sm:px-8 sm:py-9">
      <p className="text-sm font-medium text-blue-100">Tactical Equipment Management System</p>
      <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
        ยินดีต้อนรับสู่คลังจัดการยุทโธปกรณ์ของ {companyName}
      </h1>
      <div className="mt-5 flex items-center gap-2 text-sm text-blue-50">
        <span className="grid size-8 place-items-center rounded-full bg-white/15">
          <UserRound className="size-4" aria-hidden="true" />
        </span>
        <span>{fullName || user.email}</span>
      </div>
    </header>
  );
}
