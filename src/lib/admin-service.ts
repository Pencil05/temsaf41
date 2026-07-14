import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";
import { hashPassword } from "@/lib/password-utils";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type RecordRow = { rowNumber: number; record: Record<string, string> };
type Table = { name: string; headers: string[]; rows: RecordRow[] };
type Update = { range: string; values: (string | number)[][] };

export type AdminTransaction = {
  id: string;
  inventoryId: string;
  equipmentName: string;
  plateNumber: string;
  ownerCompanyId: string;
  owner: string;
  borrowerCompanyId: string;
  borrower: string;
  operator: string;
  operatorPhone: string;
  operatorEmail: string;
  quantity: number;
  status: string;
  date: string;
  dueDate: string;
  returnDate: string;
  note: string;
  evidenceImage: string;
};

export type AdminMaintenance = {
  id: string;
  inventoryId: string;
  companyId: string;
  equipmentName: string;
  companyName: string;
  operator: string;
  operatorPhone: string;
  operatorEmail: string;
  quantity: number;
  status: string;
  note: string;
  date: string;
  completedAt: string;
  completedBy: string;
  evidenceImage: string;
};

export type AdminData = {
  companies: Array<{ id: string; name: string; users: number; total: number; available: number; borrowed: number; broken: number; transactions: number }>;
  users: Array<{ id: string; companyId: string; companyName: string; role: string; rank: string; firstName: string; lastName: string; email: string; phone: string; gmail: string }>;
  equipments: Array<{ id: string; name: string; category: string; requirePlate: boolean }>;
  inventories: Array<{ id: string; companyId: string; companyName: string; equipmentId: string; equipmentName: string; category: string; plateNumber: string; total: number; available: number; borrowed: number; broken: number }>;
  transactions: AdminTransaction[];
  maintenance: AdminMaintenance[];
  logs: Array<{ id: string; user: string; action: string; target: string; timestamp: string; details: string; companyIds: string[] }>;
};

const norm = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
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
  return {
    name,
    headers,
    rows: rows
      .map((row, index) => ({ rowNumber: index + 2, record: Object.fromEntries(headers.map((header, cellIndex) => [header, String(row[cellIndex] || "").trim()])) }))
      .filter(({ record }) => Object.values(record).some(Boolean)),
  };
}

async function equipmentTable() {
  try { return await table("Equipments"); } catch { return table("Master_Equipments"); }
}

function requireColumn(sheet: Table, ...names: string[]) {
  const index = col(sheet.headers, ...names);
  if (index < 0) throw new Error(`ไม่พบคอลัมน์ ${names[0]} ในชีต ${sheet.name}`);
  return index;
}

const cell = (sheet: Table, row: number, column: number, value: string | number): Update => ({ range: `'${sheet.name}'!${letter(column)}${row}`, values: [[value]] });
const append = (sheet: Table, values: (string | number)[]): Update => ({ range: `'${sheet.name}'!A${Math.max(1, ...sheet.rows.map((row) => row.rowNumber)) + 1}:${letter(sheet.headers.length - 1)}${Math.max(1, ...sheet.rows.map((row) => row.rowNumber)) + 1}`, values: [values] });
const valuesFor = (sheet: Table, input: Record<string, string | number>) => sheet.headers.map((header) => input[header] ?? "");

function withColumns(sheet: Table, columns: string[], updates: Update[]) {
  const headers = [...sheet.headers];
  for (const column of columns) {
    if (col(headers, column) < 0) {
      updates.push(cell(sheet, 1, headers.length, column));
      headers.push(column);
    }
  }
  return { ...sheet, headers };
}

async function write(updates: Update[]) {
  await (await sheets()).spreadsheets.values.batchUpdate({ spreadsheetId: config().spreadsheetId, requestBody: { valueInputOption: "RAW", data: updates } });
}

export async function getAdminData(): Promise<AdminData> {
  const [companiesTable, usersTable, equipmentsTable, inventoriesTable, transactionsTable, maintenanceTable, logsTable] = await Promise.all([
    table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Transactions"), table("Maintenance"), table("Audit_Log"),
  ]);
  const companyNames = new Map(companiesTable.rows.map(({ record }) => [field(record, "Company_ID"), field(record, "Company_Name")]));
  const equipmentNames = new Map(equipmentsTable.rows.map(({ record }) => [field(record, "Equip_ID"), field(record, "Equip_Name")]));
  const equipmentCategories = new Map(equipmentsTable.rows.map(({ record }) => [field(record, "Equip_ID"), field(record, "Category")]));
  const userDetails = new Map(usersTable.rows.map(({ record }) => [field(record, "User_ID"), {
    name: [field(record, "Rank"), field(record, "First_Name"), field(record, "Last_Name")].filter(Boolean).join(" "),
    phone: field(record, "Phone"),
    email: field(record, "Gmail") || field(record, "Email"),
    companyId: field(record, "Company_ID"),
  }]));
  const inventoryById = new Map(inventoriesTable.rows.map(({ record }) => [field(record, "Inv_ID"), record]));
  const maintenanceById = new Map(maintenanceTable.rows.map(({ record }) => [field(record, "Maint_ID"), record]));
  const transactionById = new Map(transactionsTable.rows.map(({ record }) => [field(record, "Tx_ID"), record]));

  const users = usersTable.rows.map(({ record }) => ({ id: field(record, "User_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || "-", role: field(record, "Role"), rank: field(record, "Rank"), firstName: field(record, "First_Name"), lastName: field(record, "Last_Name"), email: field(record, "Email"), phone: field(record, "Phone"), gmail: field(record, "Gmail") }));
  const equipments = equipmentsTable.rows.map(({ record }) => ({ id: field(record, "Equip_ID"), name: field(record, "Equip_Name"), category: field(record, "Category"), requirePlate: ["true", "1", "yes"].includes(field(record, "Require_Plate").toLowerCase()) }));
  const inventories = inventoriesTable.rows.map(({ record }) => {
    const equipmentId = field(record, "Equip_ID");
    return { id: field(record, "Inv_ID"), companyId: field(record, "Company_ID"), companyName: companyNames.get(field(record, "Company_ID")) || field(record, "Company_Name"), equipmentId, equipmentName: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์", category: equipmentCategories.get(equipmentId) || "ไม่ระบุหมวดหมู่", plateNumber: field(record, "Plate_Number"), total: number(record, "Qty_Total"), available: number(record, "Qty_Available"), borrowed: number(record, "Qty_Borrowed"), broken: number(record, "Qty_Broken") };
  });
  const transactions = transactionsTable.rows.map(({ record }) => {
    const inventoryId = field(record, "Inv_ID");
    const inventory = inventoryById.get(inventoryId) || {};
    const operator = userDetails.get(field(record, "User_ID"));
    const returned = field(record, "Status").toLowerCase() === "returned";
    return { id: field(record, "Tx_ID"), inventoryId, equipmentName: equipmentNames.get(field(inventory, "Equip_ID")) || "ไม่ระบุชื่อยุทโธปกรณ์", plateNumber: field(inventory, "Plate_Number"), ownerCompanyId: field(record, "Owner_Company_ID"), owner: companyNames.get(field(record, "Owner_Company_ID")) || "-", borrowerCompanyId: field(record, "Borrower_Company_ID"), borrower: companyNames.get(field(record, "Borrower_Company_ID")) || "-", operator: operator?.name || "-", operatorPhone: operator?.phone || "", operatorEmail: operator?.email || "", quantity: number(record, "Qty"), status: field(record, "Status"), date: field(record, "Borrow_Date"), dueDate: field(record, "Due_Date"), returnDate: field(record, "Return_Date"), note: field(record, "Note"), evidenceImage: returned ? field(record, "Return_Evidence_Image", "Return_Evidence", "Returned_Evidence_Image") : field(record, "Evidence_Image") };
  }).sort((a, b) => Date.parse(b.returnDate || b.date) - Date.parse(a.returnDate || a.date));
  const maintenance = maintenanceTable.rows.map(({ record }) => {
    const inventoryId = field(record, "Inv_ID");
    const inventory = inventoryById.get(inventoryId) || {};
    const operator = userDetails.get(field(record, "User_ID"));
    return { id: field(record, "Maint_ID"), inventoryId, companyId: field(inventory, "Company_ID"), equipmentName: equipmentNames.get(field(inventory, "Equip_ID")) || "ไม่ระบุชื่อยุทโธปกรณ์", companyName: companyNames.get(field(inventory, "Company_ID")) || "-", operator: operator?.name || "-", operatorPhone: operator?.phone || "", operatorEmail: operator?.email || "", quantity: number(record, "Qty"), status: field(record, "Status"), note: field(record, "Note"), date: field(record, "Reported_At"), completedAt: field(record, "Completed_At"), completedBy: userDetails.get(field(record, "Completed_By_User_ID"))?.name || "", evidenceImage: field(record, "Evidence_Image", "Evidence", "Evidence_File") };
  }).sort((a, b) => Date.parse(b.completedAt || b.date) - Date.parse(a.completedAt || a.date));
  const logs = logsTable.rows.map(({ record }) => {
    const target = field(record, "Target_ID");
    const targetInventory = inventoryById.get(target);
    const targetMaintenance = maintenanceById.get(target);
    const targetTransaction = transactionById.get(target);
    const maintenanceInventory = targetMaintenance ? inventoryById.get(field(targetMaintenance, "Inv_ID")) : undefined;
    const companyIds = new Set<string>();
    if (targetInventory) companyIds.add(field(targetInventory, "Company_ID"));
    if (maintenanceInventory) companyIds.add(field(maintenanceInventory, "Company_ID"));
    if (targetTransaction) {
      companyIds.add(field(targetTransaction, "Owner_Company_ID"));
      companyIds.add(field(targetTransaction, "Borrower_Company_ID"));
    }
    const targetUser = userDetails.get(target);
    if (targetUser?.companyId) companyIds.add(targetUser.companyId);
    const actor = userDetails.get(field(record, "User_ID"));
    return { id: field(record, "Log_ID"), user: actor?.name || field(record, "User_ID") || "ระบบ", action: field(record, "Action_Type"), target, timestamp: field(record, "Timestamp"), details: field(record, "Details"), companyIds: [...companyIds].filter(Boolean) };
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const companies = companiesTable.rows.map(({ record }) => { const id = field(record, "Company_ID"); const name = field(record, "Company_Name"); const stock = inventories.filter((item) => item.companyId === id); return { id, name, users: users.filter((item) => item.companyId === id).length, total: stock.reduce((sum, item) => sum + item.total, 0), available: stock.reduce((sum, item) => sum + item.available, 0), borrowed: stock.reduce((sum, item) => sum + item.borrowed, 0), broken: stock.reduce((sum, item) => sum + item.broken, 0), transactions: transactions.filter((item) => item.ownerCompanyId === id || item.borrowerCompanyId === id).length }; });
  return { companies, users, equipments, inventories, transactions, maintenance, logs };
}

export async function adminMutation(admin: SessionUser, input: Record<string, unknown>) {
  if (admin.role !== "Admin") throw new Error("ไม่มีสิทธิ์ผู้ดูแลระบบ");
  return withSheetsMutationLock(async () => {
    const action = String(input.action || "");
    const [companies, users, equipments, inventories, maintenanceSource, logsSource] = await Promise.all([table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Maintenance"), table("Audit_Log")]);
    const updates: Update[] = [];
    const logs = withColumns(logsSource, ["Details"], updates);
    let maintenance = maintenanceSource;
    let target = String(input.id || "");

    if (action === "save-company") {
      target ||= `CMP-${randomUUID().slice(0, 8)}`;
      const row = companies.rows.find(({ record }) => field(record, "Company_ID") === target);
      if (row) updates.push(cell(companies, row.rowNumber, requireColumn(companies, "Company_Name"), String(input.name || "")));
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
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(equipments, row.rowNumber, requireColumn(equipments, key), value)));
      else updates.push(append(equipments, valuesFor(equipments, payload)));
    } else if (action === "save-inventory") {
      target ||= `INV-${randomUUID().slice(0, 8)}`;
      const row = inventories.rows.find(({ record }) => field(record, "Inv_ID") === target);
      const companyId = String(input.companyId || "");
      const companyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name");
      const payload = { Inv_ID: target, Company_ID: companyId, Company_Name: companyName, Equip_ID: String(input.equipmentId || ""), Plate_Number: String(input.plateNumber || ""), Qty_Total: Number(input.total) || 0, Qty_Available: Number(input.available) || 0, Qty_Borrowed: Number(input.borrowed) || 0, Qty_Broken: Number(input.broken) || 0 };
      if (payload.Qty_Total !== payload.Qty_Available + payload.Qty_Borrowed + payload.Qty_Broken) throw new Error("ยอดรวมต้องเท่ากับ พร้อมใช้ + ถูกยืม + ชำรุด");
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(inventories, row.rowNumber, requireColumn(inventories, key), value)));
      else updates.push(append(inventories, valuesFor(inventories, payload)));
    } else if (action === "transfer-inventory") {
      const source = inventories.rows.find(({ record }) => field(record, "Inv_ID") === String(input.sourceInventoryId || ""));
      const destinationCompanyId = String(input.destinationCompanyId || "");
      const quantity = Math.floor(Number(input.quantity));
      if (!source) throw new Error("ไม่พบรายการคลังต้นทาง");
      const sourceCompanyId = field(source.record, "Company_ID");
      if (!destinationCompanyId || destinationCompanyId === sourceCompanyId) throw new Error("กรุณาเลือกกองร้อยปลายทางที่ต่างจากต้นทาง");
      const available = number(source.record, "Qty_Available");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error(`ย้ายได้สูงสุด ${available} รายการ`);
      const equipmentId = field(source.record, "Equip_ID");
      const plateNumber = field(source.record, "Plate_Number");
      const destinationCompanyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === destinationCompanyId)?.record || {}, "Company_Name");
      if (!destinationCompanyName) throw new Error("ไม่พบกองร้อยปลายทาง");
      const destination = inventories.rows.find(({ record }) => field(record, "Company_ID") === destinationCompanyId && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number") === plateNumber);
      updates.push(
        cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Total"), number(source.record, "Qty_Total") - quantity),
        cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Available"), available - quantity),
      );
      if (destination) {
        updates.push(
          cell(inventories, destination.rowNumber, requireColumn(inventories, "Qty_Total"), number(destination.record, "Qty_Total") + quantity),
          cell(inventories, destination.rowNumber, requireColumn(inventories, "Qty_Available"), number(destination.record, "Qty_Available") + quantity),
        );
      } else {
        updates.push(append(inventories, valuesFor(inventories, { Inv_ID: `INV-${randomUUID().slice(0, 8)}`, Company_ID: destinationCompanyId, Company_Name: destinationCompanyName, Equip_ID: equipmentId, Plate_Number: plateNumber, Qty_Total: quantity, Qty_Available: quantity, Qty_Borrowed: 0, Qty_Broken: 0 })));
      }
      target = field(source.record, "Inv_ID");
    } else if (action === "maintenance-status") {
      const row = maintenance.rows.find(({ record }) => field(record, "Maint_ID") === target);
      if (!row) throw new Error("ไม่พบรายการซ่อม");
      const currentStatus = field(row.record, "Status").toLowerCase();
      const nextStatus = String(input.status || "Reported");
      if (currentStatus === "completed" && nextStatus.toLowerCase() !== "completed") throw new Error("งานที่ซ่อมเสร็จแล้วไม่สามารถย้อนสถานะได้");
      if (nextStatus.toLowerCase() === "completed" && currentStatus !== "completed") {
        maintenance = withColumns(maintenance, ["Completed_At", "Completed_By_User_ID"], updates);
        const inventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === field(row.record, "Inv_ID"));
        if (!inventory) throw new Error("ไม่พบคลังเดิมของยุทโธปกรณ์ที่ซ่อม");
        const quantity = number(row.record, "Qty");
        const broken = number(inventory.record, "Qty_Broken");
        if (quantity < 1 || broken < quantity) throw new Error("ยอดชำรุดในคลังไม่เพียงพอสำหรับปิดงานซ่อม");
        updates.push(
          cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Broken"), broken - quantity),
          cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Available"), number(inventory.record, "Qty_Available") + quantity),
          cell(maintenance, row.rowNumber, requireColumn(maintenance, "Completed_At"), new Date().toISOString()),
          cell(maintenance, row.rowNumber, requireColumn(maintenance, "Completed_By_User_ID"), admin.userId),
        );
      }
      updates.push(cell(maintenance, row.rowNumber, requireColumn(maintenance, "Status"), nextStatus));
    } else {
      throw new Error("คำสั่งไม่ถูกต้อง");
    }

    const safeDetails = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "password"));
    updates.push(append(logs, valuesFor(logs, { Log_ID: `LOG-${randomUUID()}`, User_ID: admin.userId, Action_Type: `ADMIN_${action.toUpperCase().replace(/-/g, "_")}`, Target_ID: target, Timestamp: new Date().toISOString(), Details: JSON.stringify(safeDetails) })));
    await write(updates);
    return { success: true, id: target };
  });
}
