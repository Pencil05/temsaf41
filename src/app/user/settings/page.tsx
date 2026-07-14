import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsProfilePanel } from "@/components/account/settings-profile-panel";
import { getAccountById } from "@/lib/account-service";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function UserSettingsPage() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user) redirect("/");

  const profile = await getAccountById(user.userId);
  if (!profile) redirect("/");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-950">ตั้งค่าโปรไฟล์</h1>
        <p className="mt-1 text-sm text-slate-500">แก้ไขข้อมูลส่วนตัว รูปโปรไฟล์ เบอร์มือถือ และความปลอดภัยของบัญชี</p>

        <div className="mt-6">
          <SettingsProfilePanel profile={profile} />
        </div>
      </div>
    </main>
  );
}
