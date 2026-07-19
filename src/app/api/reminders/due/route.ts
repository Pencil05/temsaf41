import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/due-reminder-service";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await sendDueReminders()); }
  catch (error) { console.error("TEMS due reminder failed", error); return NextResponse.json({ error: "Reminder delivery failed" }, { status: 500 }); }
}
