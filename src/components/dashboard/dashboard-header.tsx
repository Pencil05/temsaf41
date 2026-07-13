import { Plane, UserRound } from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";

type DashboardHeaderProps = {
  user: SessionUser;
  companyName: string;
};

export function DashboardHeader({ user, companyName }: DashboardHeaderProps) {
  const fullName = [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <header className="linear-dark-panel relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0a2748] via-[#124f86] to-[#147ac2] px-5 py-7 text-white shadow-[0_18px_40px_rgba(18,79,134,0.28)] sm:px-8 sm:py-9">
      <span className="absolute -right-12 -top-16 size-52 rounded-full border-[28px] border-white/5" />
      <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[#e4c46a] to-transparent" />
      <p className="relative flex items-center gap-2 text-sm font-medium text-sky-100"><span className="grid size-8 place-items-center rounded-lg bg-white/10 text-[#f3d77d]"><Plane className="size-4" /></span>Tactical Equipment Management System</p>
      <h1 className="relative mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
        ยินดีต้อนรับสู่คลังจัดการยุทโธปกรณ์ของ {companyName}
      </h1>
      <div className="relative mt-5 flex items-center gap-2 text-sm text-blue-50">
        <span className="grid size-8 place-items-center rounded-full bg-white/15">
          <UserRound className="size-4" aria-hidden="true" />
        </span>
        <span>{fullName || user.email}</span>
      </div>
    </header>
  );
}
