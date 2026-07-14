import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/admin-console";
import { getAdminData } from "@/lib/admin-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.role !== "Admin") redirect("/user/dashboard");
  const data = await getAdminData();
  return <AdminConsole initialData={data} adminName={`${user.rank} ${user.firstName} ${user.lastName}`} />;
}
