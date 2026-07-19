import { NextResponse } from "next/server";
import { runScheduledAdminReports } from "@/lib/admin-operations-service";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runScheduledAdminReports());
  } catch (error) {
    console.error("TEMS scheduled report failed", error);
    return NextResponse.json({ error: "Scheduled report failed" }, { status: 500 });
  }
}
