import "server-only";

import { gunzipSync, gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";
import type { AdminData } from "@/lib/admin-service";
import { sendLineAdminText } from "@/lib/line-oa-notification";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type Row = { rowNumber: number; record: Record<string, string> };
type Table = { name: string; headers: string[]; rows: Row[] };
type SheetUpdate = { range: string; values: (string | number)[][] };
type UndoChange = { range: string; before: string[][]; after: string[][] };

export type AdminApproval = { id: string; type: "inventory-count" | "maintenance"; referenceId: string; companyId: string; companyName: string; title: string; detail: string; status: string; createdAt: string; requestedBy: string };
export type InventoryCountRecord = { id: string; batchId: string; inventoryId: string; companyId: string; companyName: string; equipmentName: string; plateNumber: string; expected: number; actual: number; difference: number; status: string; countedBy: string; countedAt: string };
export type ReportSchedule = { id: string; frequency: "daily" | "weekly" | "monthly"; hour: number; day: number; enabled: boolean; lastSentKey: string };
export type UndoRecord = { id: string; action: string; target: string; actor: string; createdAt: string; expiresAt: string; status: string };
export type SheetHealth = { name: string; ok: boolean; rows: number; columns: number; latencyMs: number; message: string };
export type AdminOperationsData = { approvals: AdminApproval[]; counts: InventoryCountRecord[]; schedules: ReportSchedule[]; undo: UndoRecord[]; sheetHealth: SheetHealth[]; checkedAt: string };

const APPROVAL_HEADERS = ["Approval_ID", "Type", "Reference_ID", "Requested_By", "Company_ID", "Title", "Details", "Status", "Created_At", "Decided_At", "Decided_By"];
const COUNT_HEADERS = ["Count_ID", "Batch_ID", "Inv_ID", "Company_ID", "Equip_ID", "Expected_Available", "Actual_Available", "Difference", "Status", "Counted_By", "Counted_At", "Approved_By", "Approved_At"];
const SCHEDULE_HEADERS = ["Schedule_ID", "Frequency", "Hour", "Day", "Enabled", "Last_Sent_Key", "Updated_By", "Updated_At"];
const UNDO_HEADERS = ["Undo_ID", "User_ID", "Action_Type", "Target_ID", "Created_At", "Expires_At", "Status", "Changes_1", "Changes_2", "Changes_3", "Changes_4", "Changes_5", "Changes_6", "Changes_7", "Changes_8", "Changes_9", "Changes_10"];
const REQUIRED_SHEETS = ["Companies", "Users", "Equipments", "Inventories", "Transactions", "Maintenance", "Audit_Log"];

const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
const field = (record: Record<string, string>, ...names: string[]) => record[Object.keys(record).find((key) => names.some((name) => normalize(key) === normalize(name))) || ""] || "";
const numeric = (record: Record<string, string>, ...names: string[]) => Number(field(record, ...names).replace(/,/g, "")) || 0;
const column = (headers: string[], name: string) => headers.findIndex((header) => normalize(header) === normalize(name));
const columnLetter = (index: number) => { let value = index + 1; let result = ""; while (value) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); } return result; };

function configuration() {
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();
  if (!email || !key || !spreadsheetId) throw new Error("Google Sheets is not configured.");
  return { email, key, spreadsheetId };
}

async function client() {
  const { email, key } = configuration();
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

async function readTable(name: string): Promise<Table> {
  const response = await (await client()).spreadsheets.values.get({ spreadsheetId: configuration().spreadsheetId, range: `'${name}'!A:ZZ` });
  const [rawHeaders = [], ...values] = response.data.values || [];
  const headers = rawHeaders.map(String);
  return { name, headers, rows: values.map((row, index) => ({ rowNumber: index + 2, record: Object.fromEntries(headers.map((header, cellIndex) => [header, String(row[cellIndex] || "").trim()])) })).filter((row) => Object.values(row.record).some(Boolean)) };
}

async function ensureTable(name: string, headers: string[]): Promise<Table> {
  const sheetsClient = await client();
  const metadata = await sheetsClient.spreadsheets.get({ spreadsheetId: configuration().spreadsheetId, fields: "sheets.properties.title" });
  if (!metadata.data.sheets?.some((sheet) => sheet.properties?.title === name)) {
    await sheetsClient.spreadsheets.batchUpdate({ spreadsheetId: configuration().spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: name } } }] } });
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: configuration().spreadsheetId, range: `'${name}'!A1:${columnLetter(headers.length - 1)}1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
  }
  const table = await readTable(name);
  if (!table.headers.length) {
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: configuration().spreadsheetId, range: `'${name}'!A1:${columnLetter(headers.length - 1)}1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
    return { ...table, headers };
  }
  return table;
}

const rowValues = (table: Table, values: Record<string, string | number>) => table.headers.map((header) => values[header] ?? "");
const appendRange = (table: Table, offset = 0) => { const row = Math.max(1, ...table.rows.map((item) => item.rowNumber)) + 1 + offset; return `'${table.name}'!A${row}:${columnLetter(table.headers.length - 1)}${row}`; };
const cellRange = (table: Table, row: number, name: string) => { const index = column(table.headers, name); if (index < 0) throw new Error(`ไม่พบคอลัมน์ ${name} ในชีต ${table.name}`); return `'${table.name}'!${columnLetter(index)}${row}`; };

async function write(updates: SheetUpdate[]) {
  if (!updates.length) return;
  await (await client()).spreadsheets.values.batchUpdate({ spreadsheetId: configuration().spreadsheetId, requestBody: { valueInputOption: "RAW", data: updates } });
}

function encodeChanges(changes: UndoChange[]) { const encoded = gzipSync(JSON.stringify(changes)).toString("base64"); return Array.from({ length: 10 }, (_, index) => encoded.slice(index * 40_000, (index + 1) * 40_000)); }
function decodeChanges(record: Record<string, string>): UndoChange[] { const encoded = Array.from({ length: 10 }, (_, index) => field(record, `Changes_${index + 1}`)).join(""); return JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8")) as UndoChange[]; }

export async function prepareAdminUndoRecord(admin: SessionUser, action: string, target: string, updates: SheetUpdate[], rangesToClear: string[]) {
  if (action === "undo-admin" || (!updates.length && !rangesToClear.length)) return null;
  const meaningfulUpdates = updates.filter((update) => !update.range.startsWith("'Audit_Log'!") && !update.range.startsWith("'Admin_Undo'!"));
  const finalUpdates = [...meaningfulUpdates.reduce((items, update) => items.set(update.range, update), new Map<string, SheetUpdate>()).values()];
  const ranges = [...new Set([...finalUpdates.map((update) => update.range), ...rangesToClear])];
  if (!ranges.length) return null;
  const response = await (await client()).spreadsheets.values.batchGet({ spreadsheetId: configuration().spreadsheetId, ranges });
  const beforeByRange = new Map((response.data.valueRanges || []).map((item, index) => [ranges[index], (item.values || []).map((row) => row.map(String))]));
  const changes: UndoChange[] = [
    ...finalUpdates.map((update) => ({ range: update.range, before: beforeByRange.get(update.range) || [], after: update.values.map((row) => row.map(String)) })),
    ...rangesToClear.map((range) => ({ range, before: beforeByRange.get(range) || [], after: [] })),
  ];
  const chunks = encodeChanges(changes);
  if (chunks.join("").length > 400_000) return null;
  const undo = await ensureTable("Admin_Undo", UNDO_HEADERS);
  const now = new Date();
  const id = `UNDO-${randomUUID()}`;
  return { id, update: { range: appendRange(undo), values: [rowValues(undo, { Undo_ID: id, User_ID: admin.userId, Action_Type: action, Target_ID: target, Created_At: now.toISOString(), Expires_At: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), Status: "Available", ...Object.fromEntries(chunks.map((chunk, index) => [`Changes_${index + 1}`, chunk])) })] } as SheetUpdate };
}

export async function getAdminOperationsData(data: AdminData): Promise<AdminOperationsData> {
  const startedAt = Date.now();
  const [approvals, counts, schedules, undo] = await Promise.all([
    ensureTable("Admin_Approvals", APPROVAL_HEADERS), ensureTable("Inventory_Counts", COUNT_HEADERS), ensureTable("Report_Schedules", SCHEDULE_HEADERS), ensureTable("Admin_Undo", UNDO_HEADERS),
  ]);
  const companyNames = new Map(data.companies.map((company) => [company.id, company.name]));
  const inventoryById = new Map(data.inventories.map((item) => [item.id, item]));
  const users = new Map(data.users.map((user) => [user.id, `${user.rank} ${user.firstName} ${user.lastName}`.trim()]));
  const explicitApprovals: AdminApproval[] = approvals.rows.map(({ record }) => ({ id: field(record, "Approval_ID"), type: field(record, "Type") as "inventory-count", referenceId: field(record, "Reference_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || field(record, "Company_ID"), title: field(record, "Title"), detail: field(record, "Details"), status: field(record, "Status"), createdAt: field(record, "Created_At"), requestedBy: users.get(field(record, "Requested_By")) || field(record, "Requested_By") }));
  const maintenanceApprovals: AdminApproval[] = data.maintenance.filter((item) => item.status.toLowerCase() === "reported").map((item) => ({ id: `MAINT:${item.id}`, type: "maintenance", referenceId: item.id, companyId: item.companyId, companyName: item.companyName, title: `รับเรื่องซ่อม ${item.equipmentName}`, detail: `${item.quantity.toLocaleString("th-TH")} รายการ${item.plateNumber ? ` · ${item.plateNumber}` : ""} · ${item.note || "ไม่มีหมายเหตุ"}`, status: "Pending", createdAt: item.date, requestedBy: item.operator }));
  const countRecords = counts.rows.map(({ record }) => { const inventory = inventoryById.get(field(record, "Inv_ID")); return { id: field(record, "Count_ID"), batchId: field(record, "Batch_ID"), inventoryId: field(record, "Inv_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || field(record, "Company_ID"), equipmentName: inventory?.equipmentName || field(record, "Equip_ID"), plateNumber: inventory?.plateNumber || "", expected: numeric(record, "Expected_Available"), actual: numeric(record, "Actual_Available"), difference: numeric(record, "Difference"), status: field(record, "Status"), countedBy: users.get(field(record, "Counted_By")) || field(record, "Counted_By"), countedAt: field(record, "Counted_At") }; }).sort((a, b) => Date.parse(b.countedAt) - Date.parse(a.countedAt));
  const reportSchedules = schedules.rows.map(({ record }) => ({ id: field(record, "Schedule_ID"), frequency: field(record, "Frequency") as ReportSchedule["frequency"], hour: numeric(record, "Hour"), day: numeric(record, "Day"), enabled: field(record, "Enabled").toLowerCase() === "true", lastSentKey: field(record, "Last_Sent_Key") }));
  const undoRecords = undo.rows.map(({ record }) => ({ id: field(record, "Undo_ID"), action: field(record, "Action_Type"), target: field(record, "Target_ID"), actor: users.get(field(record, "User_ID")) || field(record, "User_ID"), createdAt: field(record, "Created_At"), expiresAt: field(record, "Expires_At"), status: field(record, "Status") })).filter((item) => item.status === "Available" && Date.parse(item.expiresAt) > Date.now()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const healthStarted = Date.now();
  const metadata = await (await client()).spreadsheets.get({ spreadsheetId: configuration().spreadsheetId, fields: "sheets.properties(title,gridProperties)" });
  const properties = new Map((metadata.data.sheets || []).map((sheet) => [sheet.properties?.title || "", sheet.properties]));
  const names = [...REQUIRED_SHEETS, "Admin_Approvals", "Inventory_Counts", "Report_Schedules", "Admin_Undo"];
  const health = names.map((name) => { const item = properties.get(name); return { name, ok: Boolean(item), rows: item?.gridProperties?.rowCount || 0, columns: item?.gridProperties?.columnCount || 0, latencyMs: Date.now() - healthStarted, message: item ? "เชื่อมต่อพร้อมใช้งาน" : "ไม่พบชีต" }; });
  return { approvals: [...maintenanceApprovals, ...explicitApprovals].filter((item) => item.status.toLowerCase() === "pending").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), counts: countRecords, schedules: reportSchedules, undo: undoRecords, sheetHealth: health, checkedAt: new Date(startedAt + (Date.now() - startedAt)).toISOString() };
}

export async function adminOperationsMutation(admin: SessionUser, input: Record<string, unknown>) {
  if (admin.role !== "Admin") throw new Error("ไม่มีสิทธิ์ผู้ดูแลระบบ");
  return withSheetsMutationLock(async () => {
    const action = String(input.action || "");
    if (action === "inventory-count") {
      const requested = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : [];
      if (!requested.length || requested.length > 300) throw new Error("กรุณาเลือกตรวจนับ 1-300 รายการ");
      const [inventories, equipments, counts, approvals] = await Promise.all([readTable("Inventories"), readTable("Equipments").catch(() => readTable("Master_Equipments")), ensureTable("Inventory_Counts", COUNT_HEADERS), ensureTable("Admin_Approvals", APPROVAL_HEADERS)]);
      const equipmentNames = new Map(equipments.rows.map(({ record }) => [field(record, "Equip_ID"), field(record, "Equip_Name")]));
      const updates: SheetUpdate[] = [];
      const batchId = `COUNT-${randomUUID()}`;
      const now = new Date().toISOString();
      let countOffset = 0;
      let approvalOffset = 0;
      for (const requestedItem of requested) {
        const inventoryId = String(requestedItem.inventoryId || "");
        const inventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === inventoryId);
        if (!inventory) throw new Error(`ไม่พบรายการคลัง ${inventoryId}`);
        const expected = numeric(inventory.record, "Qty_Available");
        const actual = Math.floor(Number(requestedItem.actual));
        if (!Number.isInteger(actual) || actual < 0) throw new Error("ยอดตรวจนับจริงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
        const difference = actual - expected;
        const countId = `CNT-${randomUUID()}`;
        const status = difference === 0 ? "Verified" : "Pending";
        updates.push({ range: appendRange(counts, countOffset++), values: [rowValues(counts, { Count_ID: countId, Batch_ID: batchId, Inv_ID: inventoryId, Company_ID: field(inventory.record, "Company_ID"), Equip_ID: field(inventory.record, "Equip_ID"), Expected_Available: expected, Actual_Available: actual, Difference: difference, Status: status, Counted_By: admin.userId, Counted_At: now })] });
        if (difference !== 0) updates.push({ range: appendRange(approvals, approvalOffset++), values: [rowValues(approvals, { Approval_ID: `APR-${randomUUID()}`, Type: "inventory-count", Reference_ID: countId, Requested_By: admin.userId, Company_ID: field(inventory.record, "Company_ID"), Title: `อนุมัติปรับยอด ${equipmentNames.get(field(inventory.record, "Equip_ID")) || inventoryId}`, Details: JSON.stringify({ inventoryId, expected, actual, difference }), Status: "Pending", Created_At: now })] });
      }
      await write(updates);
      return { success: true, id: batchId };
    }
    if (action === "decide-count") {
      const decision = String(input.decision || "").toLowerCase();
      if (!['approved', 'rejected'].includes(decision)) throw new Error("ผลการอนุมัติไม่ถูกต้อง");
      const [approvals, counts, inventories, logs] = await Promise.all([ensureTable("Admin_Approvals", APPROVAL_HEADERS), ensureTable("Inventory_Counts", COUNT_HEADERS), readTable("Inventories"), readTable("Audit_Log")]);
      const approval = approvals.rows.find(({ record }) => field(record, "Approval_ID") === String(input.id || ""));
      if (!approval || field(approval.record, "Status").toLowerCase() !== "pending") throw new Error("รายการอนุมัตินี้ถูกดำเนินการแล้ว");
      const count = counts.rows.find(({ record }) => field(record, "Count_ID") === field(approval.record, "Reference_ID"));
      if (!count) throw new Error("ไม่พบผลตรวจนับต้นทาง");
      const inventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === field(count.record, "Inv_ID"));
      if (!inventory) throw new Error("ไม่พบรายการคลัง");
      const updates: SheetUpdate[] = [
        { range: cellRange(approvals, approval.rowNumber, "Status"), values: [[decision === "approved" ? "Approved" : "Rejected"]] },
        { range: cellRange(approvals, approval.rowNumber, "Decided_At"), values: [[new Date().toISOString()]] },
        { range: cellRange(approvals, approval.rowNumber, "Decided_By"), values: [[admin.userId]] },
        { range: cellRange(counts, count.rowNumber, "Status"), values: [[decision === "approved" ? "Adjusted" : "Rejected"]] },
        { range: cellRange(counts, count.rowNumber, "Approved_By"), values: [[admin.userId]] },
        { range: cellRange(counts, count.rowNumber, "Approved_At"), values: [[new Date().toISOString()]] },
      ];
      if (decision === "approved") {
        const actual = numeric(count.record, "Actual_Available");
        updates.push({ range: cellRange(inventories, inventory.rowNumber, "Qty_Available"), values: [[actual]] }, { range: cellRange(inventories, inventory.rowNumber, "Qty_Total"), values: [[actual + numeric(inventory.record, "Qty_Borrowed") + numeric(inventory.record, "Qty_Broken")]] });
      }
      updates.push({ range: appendRange(logs), values: [rowValues(logs, { Log_ID: `LOG-${randomUUID()}`, User_ID: admin.userId, Action_Type: "ADMIN_INVENTORY_COUNT_DECISION", Target_ID: field(count.record, "Count_ID"), Timestamp: new Date().toISOString(), Details: JSON.stringify({ decision, inventoryId: field(count.record, "Inv_ID"), actual: numeric(count.record, "Actual_Available"), difference: numeric(count.record, "Difference") }) })] });
      await write(updates);
      return { success: true };
    }
    if (action === "save-report-schedule") {
      const schedules = await ensureTable("Report_Schedules", SCHEDULE_HEADERS);
      const frequency = String(input.frequency || "daily") as ReportSchedule["frequency"];
      if (!["daily", "weekly", "monthly"].includes(frequency)) throw new Error("รอบรายงานไม่ถูกต้อง");
      const existing = schedules.rows.find(({ record }) => field(record, "Frequency") === frequency);
      const values = { Schedule_ID: existing ? field(existing.record, "Schedule_ID") : `SCH-${randomUUID()}`, Frequency: frequency, Hour: Math.max(0, Math.min(23, Number(input.hour) || 0)), Day: Math.max(1, Number(input.day) || 1), Enabled: input.enabled ? "TRUE" : "FALSE", Last_Sent_Key: existing ? field(existing.record, "Last_Sent_Key") : "", Updated_By: admin.userId, Updated_At: new Date().toISOString() };
      if (existing) await write(Object.entries(values).filter(([key]) => key !== "Schedule_ID" && key !== "Last_Sent_Key").map(([key, value]) => ({ range: cellRange(schedules, existing.rowNumber, key), values: [[value]] })));
      else await write([{ range: appendRange(schedules), values: [rowValues(schedules, values)] }]);
      return { success: true };
    }
    if (action === "undo-admin") return undoAdminMutation(admin, String(input.id || ""));
    throw new Error("คำสั่งศูนย์ปฏิบัติการไม่ถูกต้อง");
  });
}

async function undoAdminMutation(admin: SessionUser, id: string) {
  const [undo, logs] = await Promise.all([ensureTable("Admin_Undo", UNDO_HEADERS), readTable("Audit_Log")]);
  const record = undo.rows.find(({ record }) => field(record, "Undo_ID") === id);
  if (!record || field(record.record, "Status") !== "Available") throw new Error("รายการนี้ไม่สามารถ Undo ได้");
  if (Date.parse(field(record.record, "Expires_At")) <= Date.now()) throw new Error("รายการนี้เกินเวลา Undo 1 ชั่วโมงแล้ว");
  const changes = decodeChanges(record.record);
  const sheetsClient = await client();
  const current = await sheetsClient.spreadsheets.values.batchGet({ spreadsheetId: configuration().spreadsheetId, ranges: changes.map((change) => change.range) });
  const normalized = (values: unknown[][] | null | undefined) => {
    const rows = (values || []).map((row) => { const cells = row.map((value) => String(value ?? "")); while (cells.at(-1) === "") cells.pop(); return cells; });
    while (rows.length && rows.at(-1)?.length === 0) rows.pop();
    return JSON.stringify(rows);
  };
  changes.forEach((change, index) => { if (normalized(current.data.valueRanges?.[index]?.values) !== normalized(change.after)) throw new Error(`ไม่สามารถ Undo ได้ เพราะข้อมูล ${change.range} ถูกเปลี่ยนแปลงต่อแล้ว`); });
  const restore = changes.filter((change) => change.before.length).map((change) => ({ range: change.range, values: change.before }));
  const clear = changes.filter((change) => !change.before.length).map((change) => change.range);
  if (clear.length) await sheetsClient.spreadsheets.values.batchClear({ spreadsheetId: configuration().spreadsheetId, requestBody: { ranges: clear } });
  await write(restore);
  await write([
    { range: cellRange(undo, record.rowNumber, "Status"), values: [["Reverted"]] },
    { range: appendRange(logs), values: [rowValues(logs, { Log_ID: `LOG-${randomUUID()}`, User_ID: admin.userId, Action_Type: "ADMIN_UNDO", Target_ID: id, Timestamp: new Date().toISOString(), Details: JSON.stringify({ action: field(record.record, "Action_Type"), target: field(record.record, "Target_ID") }) })] },
  ]);
  return { success: true };
}

export async function runScheduledAdminReports(now = new Date()) {
  const schedules = await ensureTable("Report_Schedules", SCHEDULE_HEADERS);
  const bangkok = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const dateKey = `${bangkok.getFullYear()}-${bangkok.getMonth() + 1}-${bangkok.getDate()}`;
  const due = schedules.rows.filter(({ record }) => {
    if (field(record, "Enabled").toLowerCase() !== "true" || numeric(record, "Hour") !== bangkok.getHours()) return false;
    const frequency = field(record, "Frequency");
    const periodKey = frequency === "daily" ? dateKey : frequency === "weekly" ? `${bangkok.getFullYear()}-W${Math.ceil((((bangkok.getTime() - new Date(bangkok.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(bangkok.getFullYear(), 0, 1).getDay() + 1) / 7)}` : `${bangkok.getFullYear()}-${bangkok.getMonth() + 1}`;
    const dayMatches = frequency === "daily" || (frequency === "weekly" && bangkok.getDay() === numeric(record, "Day")) || (frequency === "monthly" && bangkok.getDate() === numeric(record, "Day"));
    return dayMatches && field(record, "Last_Sent_Key") !== periodKey;
  });
  if (!due.length) return { sent: 0 };
  const [inventories, transactions, maintenance] = await Promise.all([readTable("Inventories"), readTable("Transactions"), readTable("Maintenance")]);
  const total = inventories.rows.reduce((sum, row) => sum + numeric(row.record, "Qty_Total"), 0);
  const available = inventories.rows.reduce((sum, row) => sum + numeric(row.record, "Qty_Available"), 0);
  const borrowed = transactions.rows.filter(({ record }) => ["borrowed", "overdue"].includes(field(record, "Status").toLowerCase()) && field(record, "Transaction_Type").toLowerCase() !== "return").length;
  const overdue = transactions.rows.filter(({ record }) => field(record, "Status").toLowerCase() === "overdue" || (["borrowed"].includes(field(record, "Status").toLowerCase()) && Date.parse(field(record, "Due_Date")) < now.getTime())).length;
  const repairing = maintenance.rows.filter(({ record }) => !["completed", "disposed"].includes(field(record, "Status").toLowerCase())).length;
  let sent = 0;
  for (const schedule of due) {
    const frequency = field(schedule.record, "Frequency");
    const label = frequency === "daily" ? "ประจำวัน" : frequency === "weekly" ? "ประจำสัปดาห์" : "ประจำเดือน";
    const result = await sendLineAdminText([`📊 รายงาน TEMS ${label}`, "", `ยุทโธปกรณ์รวม: ${total.toLocaleString("th-TH")}`, `พร้อมใช้: ${available.toLocaleString("th-TH")}`, `รายการกำลังยืม: ${borrowed.toLocaleString("th-TH")}`, `เกินกำหนด: ${overdue.toLocaleString("th-TH")}`, `กำลังซ่อม: ${repairing.toLocaleString("th-TH")}`, "", `สร้างเมื่อ: ${new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now)}`].join("\n"));
    if (result.sent) {
      const periodKey = frequency === "daily" ? dateKey : frequency === "weekly" ? `${bangkok.getFullYear()}-W${Math.ceil((((bangkok.getTime() - new Date(bangkok.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(bangkok.getFullYear(), 0, 1).getDay() + 1) / 7)}` : `${bangkok.getFullYear()}-${bangkok.getMonth() + 1}`;
      await write([{ range: cellRange(schedules, schedule.rowNumber, "Last_Sent_Key"), values: [[periodKey]] }]);
      sent += 1;
    }
  }
  return { sent };
}
