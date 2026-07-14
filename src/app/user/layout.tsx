import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserShell } from "@/components/navigation/user-shell";
import { getAccountById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getGlobalEquipmentSearchItems } from "@/lib/google-sheets";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.role === "Admin") redirect("/admin/dashboard");
  const profile = await getAccountById(user.userId) || { ...user, phone: "", gmail: "", profileImage: "" };
  const searchItems = await getGlobalEquipmentSearchItems();
  return <UserShell profile={profile} searchItems={searchItems}>{children}</UserShell>;
}
