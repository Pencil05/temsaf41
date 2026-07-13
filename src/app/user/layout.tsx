import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserShell } from "@/components/navigation/user-shell";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") redirect("/");
  const profile = { ...user, phone: "", profileImage: "" };
  return <UserShell profile={profile}>{children}</UserShell>;
}
