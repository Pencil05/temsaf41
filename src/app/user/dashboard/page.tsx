import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CategoryCard, EmptyCategories } from "@/components/dashboard/category-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SESSION_COOKIE_NAME, readSessionValue } from "@/lib/auth-session";
import { getUserDashboardData } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export default async function UserDashboardPage() {
  const cookieStore = await cookies();
  const user = readSessionValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!user || user.role !== "User") {
    redirect("/");
  }

  const dashboard = await getUserDashboardData(user);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <DashboardHeader user={user} companyName={dashboard.companyName} />

        <section className="mt-7" aria-labelledby="categories-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-600">คลังยุทโธปกรณ์</p>
              <h2 id="categories-heading" className="mt-1 text-xl font-bold text-slate-900">
                หมวดหมู่ยุทโธปกรณ์
              </h2>
            </div>
            <p className="text-xs text-slate-500">เลือกหมวดหมู่เพื่อดูรายการ</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {dashboard.categories.length ? (
              dashboard.categories.map((category) => <CategoryCard key={category.name} category={category} />)
            ) : (
              <EmptyCategories />
            )}
          </div>
        </section>

        <section className="mt-9 pb-6" aria-labelledby="activities-heading">
          <p className="text-sm font-medium text-blue-600">ติดตามสถานะ</p>
          <h2 id="activities-heading" className="mt-1 text-xl font-bold text-slate-900">
            การแจ้งเตือนและความเคลื่อนไหวล่าสุด
          </h2>
          <div className="mt-4">
            <ActivityFeed activities={dashboard.activities} />
          </div>
        </section>
      </div>
    </main>
  );
}
