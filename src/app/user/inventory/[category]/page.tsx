import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CategoryInventoryClient } from "@/components/inventory/category-inventory-client";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getCategoryInventoryData } from "@/lib/borrow-service";

export const dynamic = "force-dynamic";

export default async function CategoryInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ equipment?: string }>;
}) {
  const cookieStore = await cookies();
  const user = readSessionValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!user || user.role !== "User") {
    redirect("/");
  }

  const { category } = await params;
  const { equipment = "" } = await searchParams;
  const decodedCategory = decodeURIComponent(category);
  const data = await getCategoryInventoryData(user, decodedCategory);

  return <CategoryInventoryClient data={data} initialEquipment={equipment} />;
}
