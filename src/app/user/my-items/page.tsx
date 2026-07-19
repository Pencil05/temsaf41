import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MyItemsClient } from "@/components/user/my-items-client";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getUserTransactionHistory } from "@/lib/google-sheets";
import { getDashboardActionData } from "@/lib/inventory-action-service";

export const dynamic = "force-dynamic";

export default async function MyItemsPage() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "User") redirect("/");
  const [history, actions] = await Promise.all([getUserTransactionHistory(user), getDashboardActionData(user)]);
  return <MyItemsClient history={history} returns={actions.returns} />;
}
