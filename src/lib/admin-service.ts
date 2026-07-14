import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";
import { hashPassword } from "@/lib/password-utils";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type RecordRow = { rowNumber: number; record: Record<string, string> };
type Table = { name: string; headers: string[]; rows: RecordRow[] };
type Update = { range: string; values: (string | number)[][] };

export type AdminData = {
  companies: Array<{ id: string; name: string; users: number; total: number; available: number; borrowed: number; broken: number; transactions: number }>;
  users: Array<{ id: string; companyId: string; companyName: string; role: string; rank: string; firstName: string; lastName: string; email: string; phone: string; gmail: string }>;
  equipments: Array<{ id: string; name: string; category: string; requirePlate: boolean }>;
  inventories: Array<{ id: string; companyId: string; companyName: string; equipmentId: string; equipmentName: string; plateNumber: string; total: number; available: number; borrowed: number; broken: number }>;
  transactions: Array<{ id: string; equipmentName: string; owner: string; borrower: string; operator: string; quantity: number; status: string; date: string; dueDate: string }>;
  maintenance: Array<{ id: string; equipmentName: string; companyName: string; operator: string; quantity: number; status: string; note: string; date: string }>;
  logs: Array<{ id: string; user: string; action: string; target: string; timestamp: string; details: string }>;
};

const norm = (v: string) => v.toLowerCase().replace(/[\s_-]/g, "");
const field = (record: Record<string, string>, ...names: string[]) => record[Object.keys(record).find((key) => names.some((name) => norm(key) === norm(name))) || ""] || "";
const number = (record: Record<string, string>, ...names: string[]) => Number(field(record, ...names).replace(/,/g, "")) || 0;
const col = (headers: string[], ...names: string[]) => headers.findIndex((header) => names.some((name) => norm(header) === norm(name)));
const letter = (index: number) => { let value = index + 1; let result = ""; while (value) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); } return result; };

function config() {
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();
  if (!email || !key || !spreadsheetId) throw new Error("Google Sheets is not configured.");
  return { email, key, spreadsheetId };
}

async function sheets() {
  const { email, key } = config();
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

async function table(name: string): Promise<Table> {
  const response = await (await sheets()).spreadsheets.values.get({ spreadsheetId: config().spreadsheetId, range: `'${name}'!A:ZZ` });
  const [headerRow = [], ...rows] = response.data.values || [];
  const headers = headerRow.map(String);
  return { name, headers, rows: rows.map((row, index) => ({ rowNumber: index + 2, record: Object.fromEntries(headers.map((header, cell) => [header, String(row[cell] || "").trim()])) })).filter(({ record }) => Object.values(record).some(Boolean)) };
}

async function equipmentTable() { try { return await table("Equipments"); } catch { return table("Master_Equipments"); } }
const cell = (sheet: Table, row: number, column: number, value: string | number): Update => ({ range: `'${sheet.name}'!${letter(column)}${row}`, values: [[value]] });
const append = (sheet: Table, values: (string | number)[]): Update => ({ range: `'${sheet.name}'!A${sheet.rows.length + 2}:${letter(sheet.headers.length - 1)}${sheet.rows.length + 2}`, values: [values] });
const valuesFor = (sheet: Table, input: Record<string, string | number>) => sheet.headers.map((header) => input[header] ?? "");

async function write(updates: Update[]) {
  await (await sheets()).spreadsheets.values.batchUpdate({ spreadsheetId: config().spreadsheetId, requestBody: { valueInputOption: "RAW", data: updates } });
}

export async function getAdminData(): Promise<AdminData> {
  const [companiesTable, usersTable, equipmentsTable, inventoriesTable, transactionsTable, maintenanceTable, logsTable] = await Promise.all([
    table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Transactions"), table("Maintenance"), table("Audit_Log"),
  ]);
  const companyNames = new Map(companiesTable.rows.map(({ record }) => [field(record, "Company_ID"), field(record, "Company_Name")]));
  const equipmentNames = new Map(equipmentsTable.rows.map(({ record }) => [field(record, "Equip_ID"), field(record, "Equip_Name")]));
  const userNames = new Map(usersTable.rows.map(({ record }) => [field(record, "User_ID"), [field(record, "Rank"), field(record, "First_Name"), field(record, "Last_Name")].filter(Boolean).join(" ")]));
  const inventoryById = new Map(inventoriesTable.rows.map(({ record }) => [field(record, "Inv_ID"), record]));

  const users = usersTable.rows.map(({ record }) => ({ id: field(record, "User_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || "-", role: field(record, "Role"), rank: field(record, "Rank"), firstName: field(record, "First_Name"), lastName: field(record, "Last_Name"), email: field(record, "Email"), phone: field(record, "Phone"), gmail: field(record, "Gmail") }));
  const equipments = equipmentsTable.rows.map(({ record }) => ({ id: field(record, "Equip_ID"), name: field(record, "Equip_Name"), category: field(record, "Category"), requirePlate: ["true", "1", "yes"].includes(field(record, "Require_Plate").toLowerCase()) }));
  const inventories = inventoriesTable.rows.map(({ record }) => ({ id: field(record, "Inv_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || field(record, "Company_Name"), equipmentId: field(record, "Equip_ID"), equipmentName: equipmentNames.get(field(record, "Equip_ID")) || "ไม่ระบุชื่อ", plateNumber: field(record, "Plate_Number"), total: number(record, "Qty_Total"), available: number(record, "Qty_Available"), borrowed: number(record, "Qty_Borrowed"), broken: number(record, "Qty_Broken") }));
  const transactions = transactionsTable.rows.map(({ record }) => ({ id: field(record, "Tx_ID"), equipmentName: equipmentNames.get(field(inventoryById.get(field(record, "Inv_ID")) || {}, "Equip_ID")) || "ไม่ระบุชื่อ", owner: companyNames.get(field(record, "Owner_Company_ID")) || "-", borrower: companyNames.get(field(record, "Borrower_Company_ID")) || "-", operator: userNames.get(field(record, "User_ID")) || "-", quantity: number(record, "Qty"), status: field(record, "Status"), date: field(record, "Borrow_Date"), dueDate: field(record, "Due_Date") })).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const maintenance = maintenanceTable.rows.map(({ record }) => { const inventory = inventoryById.get(field(record, "Inv_ID")) || {}; return { id: field(record, "Maint_ID"), equipmentName: equipmentNames.get(field(inventory, "Equip_ID")) || "ไม่ระบุชื่อ", companyName: companyNames.get(field(inventory, "Company_ID")) || "-", operator: userNames.get(field(record, "User_ID")) || "-", quantity: number(record, "Qty"), status: field(record, "Status"), note: field(record, "Note"), date: field(record, "Reported_At") }; });
  const logs = logsTable.rows.map(({ record }) => ({ id: field(record, "Log_ID"), user: userNames.get(field(record, "User_ID")) || field(record, "User_ID") || "ระบบ", action: field(record, "Action_Type"), target: field(record, "Target_ID"), timestamp: field(record, "Timestamp"), details: field(record, "Details") })).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const companies = companiesTable.rows.map(({ record }) => { const id = field(record, "Company_ID"); const stock = inventories.filter((item) => item.companyId === id); return { id, name: field(record, "Company_Name"), users: users.filter((item) => item.companyId === id).length, total: stock.reduce((sum, item) => sum + item.total, 0), available: stock.reduce((sum, item) => sum + item.available, 0), borrowed: stock.reduce((sum, item) => sum + item.borrowed, 0), broken: stock.reduce((sum, item) => sum + item.broken, 0), transactions: transactions.filter((item) => item.owner === field(record, "Company_Name") || item.borrower === field(record, "Company_Name")).length }; });
  return { companies, users, equipments, inventories, transactions, maintenance, logs };
}

export async function adminMutation(admin: SessionUser, input: Record<string, unknown>) {
  if (admin.role !== "Admin") throw new Error("ไม่มีสิทธิ์ผู้ดูแลระบบ");
  return withSheetsMutationLock(async () => {
    const action = String(input.action || "");
    const [companies, users, equipments, inventories, maintenance, logs] = await Promise.all([table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Maintenance"), table("Audit_Log")]);
    const updates: Update[] = [];
    let target = String(input.id || "");
    if (action === "save-company") {
      target ||= `CMP-${randomUUID().slice(0, 8)}`;
      const row = companies.rows.find(({ record }) => field(record, "Company_ID") === target);
      if (row) updates.push(cell(companies, row.rowNumber, col(companies.headers, "Company_Name"), String(input.name || "")));
      else updates.push(append(companies, valuesFor(companies, { Company_ID: target, Company_Name: String(input.name || "") })));
    } else if (action === "save-user") {
      target ||= `USR-${randomUUID().slice(0, 8)}`;
      const row = users.rows.find(({ record }) => field(record, "User_ID") === target);
      const payload: Record<string, string | number> = { User_ID: target, Company_ID: String(input.companyId || ""), Role: String(input.role || "User"), Rank: String(input.rank || ""), First_Name: String(input.firstName || ""), Last_Name: String(input.lastName || ""), Email: String(input.email || "").toLowerCase(), Phone: String(input.phone || ""), Gmail: String(input.gmail || "").toLowerCase() };
      if (String(input.password || "")) payload.Password_Hash = hashPassword(String(input.password));
      if (row) Object.entries(payload).filter(([key]) => key !== "User_ID").forEach(([key, value]) => { const index = col(users.headers, key); if (index >= 0) updates.push(cell(users, row.rowNumber, index, value)); });
      else { if (!payload.Password_Hash) throw new Error("ผู้ใช้ใหม่ต้องกำหนดรหัสผ่าน"); updates.push(append(users, valuesFor(users, payload))); }
    } else if (action === "save-equipment") {
      target ||= `EQ-${randomUUID().slice(0, 8)}`;
      const row = equipments.rows.find(({ record }) => field(record, "Equip_ID") === target);
      const payload = { Equip_ID: target, Equip_Name: String(input.name || ""), Category: String(input.category || ""), Require_Plate: input.requirePlate ? "TRUE" : "FALSE" };
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(equipments, row.rowNumber, col(equipments.headers, key), value)));
      else updates.push(append(equipments, valuesFor(equipments, payload)));
    } else if (action === "save-inventory") {
      target ||= `INV-${randomUUID().slice(0, 8)}`;
      const row = inventories.rows.find(({ record }) => field(record, "Inv_ID") === target);
      const companyId = String(input.companyId || ""); const companyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name");
      const payload = { Inv_ID: target, Company_ID: companyId, Company_Name: companyName, Equip_ID: String(input.equipmentId || ""), Plate_Number: String(input.plateNumber || ""), Qty_Total: Number(input.total) || 0, Qty_Available: Number(input.available) || 0, Qty_Borrowed: Number(input.borrowed) || 0, Qty_Broken: Number(input.broken) || 0 };
      if (payload.Qty_Total !== payload.Qty_Available + payload.Qty_Borrowed + payload.Qty_Broken) throw new Error("ยอดรวมต้องเท่ากับ พร้อมใช้ + ถูกยืม + ชำรุด");
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(inventories, row.rowNumber, col(inventories.headers, key), value)));
      else updates.push(append(inventories, valuesFor(inventories, payload)));
    } else if (action === "maintenance-status") {
      const row = maintenance.rows.find(({ record }) => field(record, "Maint_ID") === target); if (!row) throw new Error("ไม่พบรายการซ่อม");
      updates.push(cell(maintenance, row.rowNumber, col(maintenance.headers, "Status"), String(input.status || "Reported")));
    } else throw new Error("คำสั่งไม่ถูกต้อง");
    let auditTable = logs;
    if (col(logs.headers, "Details") < 0) {
      updates.push(cell(logs, 1, logs.headers.length, "Details"));
      auditTable = { ...logs, headers: [...logs.headers, "Details"] };
    }
    const safeDetails = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "password"));
    updates.push(append(auditTable, valuesFor(auditTable, { Log_ID: `LOG-${randomUUID()}`, User_ID: admin.userId, Action_Type: `ADMIN_${action.toUpperCase().replace(/-/g, "_")}`, Target_ID: target, Timestamp: new Date().toISOString(), Details: JSON.stringify(safeDetails) })));
    await write(updates);
    return { success: true, id: target };
  });
}
