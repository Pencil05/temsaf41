import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BorrowPageClient } from "@/components/borrow/borrow-page-client";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getBorrowPageData } from "@/lib/borrow-service";

export const dynamic = "force-dynamic";

export default async function BorrowPage() {
  const cookieStore = await cookies();
  const user = readSessionValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!user || user.role !== "User") {
    redirect("/");
  }

  const data = await getBorrowPageData(user);
  return <BorrowPageClient data={data} />;
}
