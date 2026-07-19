import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";
import { hashPassword, verifyPassword } from "@/lib/password-utils";
import { getEquipmentImage } from "@/lib/equipment-images";
import { sendLineActivityNotification, type LineActivityNotification } from "@/lib/line-oa-notification";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";
import { prepareAdminUndoRecord } from "@/lib/admin-operations-service";

type RecordRow = { rowNumber: number; record: Record<string, string> };
type Table = { name: string; headers: string[]; rows: RecordRow[] };
type Update = { range: string; values: (string | number)[][] };

export type AdminTransaction = {
  id: string;
  movementType: "borrow" | "return";
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
  outstandingQuantity: number;
  activeBorrow: boolean;
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
  plateNumber: string;
  picture: string;
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

export type AdminAuditLog = {
  id: string;
  user: string;
  action: string;
  target: string;
  targetLabel: string;
  timestamp: string;
  details: string;
  companyIds: string[];
  companyNames: string[];
};

export type AdminData = {
  companies: Array<{ id: string; name: string; users: number; total: number; available: number; borrowed: number; broken: number; transactions: number }>;
  users: Array<{ id: string; companyId: string; companyName: string; role: string; rank: string; firstName: string; lastName: string; email: string; phone: string; gmail: string }>;
  equipments: Array<{ id: string; name: string; category: string; requirePlate: boolean; picture: string }>;
  categories: Array<{ id: string; name: string; icon: string }>;
  inventories: Array<{ id: string; companyId: string; companyName: string; assetOwnerCompanyId: string; equipmentId: string; equipmentName: string; category: string; plateNumber: string; requirePlate: boolean; picture: string; total: number; available: number; borrowed: number; broken: number }>;
  transactions: AdminTransaction[];
  maintenance: AdminMaintenance[];
  logs: AdminAuditLog[];
};

const CATEGORY_HEADERS = ["Category_ID", "Category_Name", "Icon", "Is_Active"];

function defaultCategoryIcon(name: string) {
  const normalized = name.toLocaleLowerCase("th");
  if (normalized.includes("ยานพาหนะ") || normalized.includes("vehicle")) return "Truck";
  if (normalized.includes("สรรพาวุธ") || normalized.includes("กระสุน")) return "Shield";
  if (normalized.includes("อาวุธ")) return "Crosshair";
  return "Boxes";
}

const norm = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
const field = (record: Record<string, string>, ...names: string[]) => record[Object.keys(record).find((key) => names.some((name) => norm(key) === norm(name))) || ""] || "";
const number = (record: Record<string, string>, ...names: string[]) => Number(field(record, ...names).replace(/,/g, "")) || 0;
const detailLabels: Record<string, string> = { action: "คำสั่ง", id: "รหัสรายการ", companyId: "กองร้อย", companyName: "ชื่อกองร้อย", equipmentId: "ยุทโธปกรณ์", equipmentName: "ชื่อยุทโธปกรณ์", userName: "ชื่อผู้ใช้งาน", sourceInventoryId: "คลังต้นทาง", destinationCompanyId: "กองร้อยปลายทาง", quantity: "จำนวน", total: "จำนวนรวม", available: "พร้อมใช้", borrowed: "ถูกยืม", broken: "ชำรุด", status: "สถานะ", name: "ชื่อ", category: "หมวดหมู่", plateNumber: "ทะเบียน/หมายเลข" };
function humanizeDetails(raw: string) { if (!raw) return "ไม่มีรายละเอียดเพิ่มเติม"; try { const parsed = JSON.parse(raw) as Record<string, unknown>; return Object.entries(parsed).filter(([key]) => !["picture", "evidenceImage"].includes(key) && !key.toLowerCase().includes("password")).map(([key, value]) => `${detailLabels[key] || key}: ${String(value || "-")}`).join(" · ") || "ไม่มีรายละเอียดเพิ่มเติม"; } catch { return raw; } }
function resolvedAuditDetails(raw: string, companyNames: Map<string, string>, inventoryById: Map<string, Record<string, string>>, equipmentNames: Map<string, string>) {
  if (!raw) return "ไม่มีรายละเอียดเพิ่มเติม";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const actionNames: Record<string, string> = { "transfer-inventory": "เคลื่อนย้ายยุทโธปกรณ์", "return-transaction": "คืนยุทโธปกรณ์", "save-inventory": "จัดการอาวุธในคลัง", "batch-adjust-inventory": "ปรับจำนวนยุทโธปกรณ์หลายรายการ", "add-inventory": "เพิ่มรายการเข้าคลัง", "batch-add-inventory": "เพิ่มยุทโธปกรณ์หลายรายการเข้าคลัง", "delete-inventory": "ลบรายการออกจากคลัง", "save-user": "จัดการผู้ใช้งาน", "delete-user": "ลบผู้ใช้งาน", "delete-company": "ลบกองร้อย", "save-category": "จัดการหมวดหมู่ยุทโธปกรณ์", "delete-equipment": "ลบชนิดยุทโธปกรณ์", "delete-equipment-category": "ลบหมวดหมู่ยุทโธปกรณ์", "report-defect": "แจ้งยุทโธปกรณ์ชำรุด", "maintenance-status": "อัปเดตสถานะซ่อม", "dispose-maintenance": "จำหน่ายยุทโธปกรณ์" };
    return Object.entries(parsed).filter(([key]) => !["picture", "evidenceImage"].includes(key) && !key.toLowerCase().includes("password")).map(([key, rawValue]) => {
      const value = String(rawValue || "-");
      if (key === "action") return `คำสั่ง: ${actionNames[value] || value}`;
      if (["companyId", "destinationCompanyId"].includes(key)) return `${key === "companyId" ? "กองร้อย" : "กองร้อยปลายทาง"}: ${companyNames.get(value) || value}`;
      if (key === "sourceInventoryId" || key === "id") {
        const inventory = inventoryById.get(value);
        if (inventory) return `${key === "sourceInventoryId" ? "คลังต้นทาง" : "รายการคลัง"}: ${equipmentNames.get(field(inventory, "Equip_ID")) || "ยุทโธปกรณ์"} ของ ${companyNames.get(field(inventory, "Company_ID")) || field(inventory, "Company_ID")}`;
      }
      if (key === "equipmentId") return `ยุทโธปกรณ์: ${equipmentNames.get(value) || value}`;
      return `${detailLabels[key] || key}: ${value}`;
    }).join(" · ") || "ไม่มีรายละเอียดเพิ่มเติม";
  } catch { return humanizeDetails(raw); }
}
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

async function optionalCategoryTable(): Promise<Table> {
  try { return await table("Equipment_Categories"); }
  catch { return { name: "Equipment_Categories", headers: CATEGORY_HEADERS, rows: [] }; }
}

async function ensureCategoryTable(): Promise<Table> {
  const client = await sheets();
  const metadata = await client.spreadsheets.get({ spreadsheetId: config().spreadsheetId, fields: "sheets.properties.title" });
  const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === "Equipment_Categories");
  if (!exists) {
    await client.spreadsheets.batchUpdate({ spreadsheetId: config().spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: "Equipment_Categories" } } }] } });
    await client.spreadsheets.values.update({ spreadsheetId: config().spreadsheetId, range: "'Equipment_Categories'!A1:D1", valueInputOption: "RAW", requestBody: { values: [CATEGORY_HEADERS] } });
  }
  const result = await table("Equipment_Categories");
  if (!result.headers.length) {
    await client.spreadsheets.values.update({ spreadsheetId: config().spreadsheetId, range: "'Equipment_Categories'!A1:D1", valueInputOption: "RAW", requestBody: { values: [CATEGORY_HEADERS] } });
    return { ...result, headers: CATEGORY_HEADERS };
  }
  return result;
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

async function clearRanges(ranges: string[]) {
  if (!ranges.length) return;
  await (await sheets()).spreadsheets.values.batchClear({ spreadsheetId: config().spreadsheetId, requestBody: { ranges } });
}

function rangesForRows(sheet: Table, rowNumbers: number[]) {
  const sorted = [...new Set(rowNumbers)].sort((first, second) => first - second);
  const groups: Array<{ start: number; end: number }> = [];
  for (const rowNumber of sorted) {
    const current = groups.at(-1);
    if (current && rowNumber === current.end + 1) current.end = rowNumber;
    else groups.push({ start: rowNumber, end: rowNumber });
  }
  const lastColumn = letter(sheet.headers.length - 1);
  return groups.map(({ start, end }) => `'${sheet.name}'!A${start}:${lastColumn}${end}`);
}

export async function getAdminData(): Promise<AdminData> {
  const [companiesTable, usersTable, equipmentSource, inventoriesTable, transactionsTable, maintenanceTable, logsTable, categoriesTable] = await Promise.all([
    table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Transactions"), table("Maintenance"), table("Audit_Log"), optionalCategoryTable(),
  ]);
  const pictureUpdates: Update[] = [];
  const equipmentsTable = withColumns(equipmentSource, ["Picture", "Is_Active"], pictureUpdates);
  const pictureColumn = requireColumn(equipmentsTable, "Picture");
  equipmentsTable.rows.forEach((row) => { if (!field(row.record, "Picture")) pictureUpdates.push(cell(equipmentsTable, row.rowNumber, pictureColumn, getEquipmentImage(field(row.record, "Equip_Name")))); });
  if (pictureUpdates.length) await write(pictureUpdates);
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
  const equipments = equipmentsTable.rows.filter(({ record }) => !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active", "Active", "Status").toLowerCase())).map(({ record }) => { const name = field(record, "Equip_Name"); return { id: field(record, "Equip_ID"), name, category: field(record, "Category"), requirePlate: ["true", "1", "yes"].includes(field(record, "Require_Plate").toLowerCase()), picture: field(record, "Picture") || getEquipmentImage(name) }; });
  const categoryByName = new Map(categoriesTable.rows.filter(({ record }) => !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active", "Active", "Status").toLowerCase())).map(({ record }) => {
    const name = field(record, "Category_Name", "Category", "Name");
    return [name, { id: field(record, "Category_ID", "ID"), name, icon: field(record, "Icon", "Icon_Name") || defaultCategoryIcon(name) }] as const;
  }));
  equipments.forEach((equipment) => { if (equipment.category && !categoryByName.has(equipment.category)) categoryByName.set(equipment.category, { id: "", name: equipment.category, icon: defaultCategoryIcon(equipment.category) }); });
  const categories = [...categoryByName.values()].sort((first, second) => first.name.localeCompare(second.name, "th"));
  const inventories = inventoriesTable.rows.map(({ record }) => {
    const equipmentId = field(record, "Equip_ID");
    const equipment = equipments.find((item) => item.id === equipmentId);
    const companyId = field(record, "Company_ID");
    const plateNumber = field(record, "Plate_Number");
    const inferredOwner = transactionsTable.rows.find(({ record: transaction }) => {
      if (field(transaction, "Transaction_Type").toLowerCase() === "return" || !["borrowed", "overdue"].includes(field(transaction, "Status").toLowerCase())) return false;
      if (field(transaction, "Borrower_Company_ID") !== companyId || field(transaction, "Owner_Company_ID") === companyId) return false;
      const sourceInventory = inventoryById.get(field(transaction, "Inv_ID")) || {};
      const transactionEquipmentId = field(transaction, "Equip_ID") || field(sourceInventory, "Equip_ID");
      const transactionPlateNumber = field(transaction, "Plate_Number") || field(sourceInventory, "Plate_Number");
      return transactionEquipmentId === equipmentId && (!transactionPlateNumber || transactionPlateNumber === plateNumber);
    });
    return { id: field(record, "Inv_ID"), companyId, companyName: companyNames.get(companyId) || field(record, "Company_Name"), assetOwnerCompanyId: field(record, "Asset_Owner_Company_ID") || field(inferredOwner?.record || {}, "Owner_Company_ID"), equipmentId, equipmentName: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์", category: equipmentCategories.get(equipmentId) || "ไม่ระบุหมวดหมู่", plateNumber, requirePlate: Boolean(equipment?.requirePlate), picture: equipment?.picture || getEquipmentImage(equipmentNames.get(equipmentId) || ""), total: number(record, "Qty_Total"), available: number(record, "Qty_Available"), borrowed: number(record, "Qty_Borrowed"), broken: number(record, "Qty_Broken") };
  });
  const transactions = transactionsTable.rows.map(({ record }) => {
    const inventoryId = field(record, "Inv_ID");
    const inventory = inventoryById.get(inventoryId) || {};
    const operator = userDetails.get(field(record, "User_ID"));
    const transactionType = field(record, "Transaction_Type").toLowerCase();
    const movementType = transactionType === "return" || (!transactionType && field(record, "Status").toLowerCase() === "returned") ? "return" as const : "borrow" as const;
    const status = field(record, "Status");
    const outstandingQuantity = number(record, "Outstanding_Qty") || (status.toLowerCase() === "returned" ? 0 : number(record, "Qty"));
    const activeBorrow = movementType === "borrow" && ["borrowed", "overdue"].includes(status.toLowerCase()) && outstandingQuantity > 0 && Boolean(field(inventory, "Inv_ID")) && number(inventory, "Qty_Borrowed") > 0;
    return { id: field(record, "Tx_ID"), movementType, inventoryId, equipmentName: equipmentNames.get(field(inventory, "Equip_ID")) || equipmentNames.get(field(record, "Equip_ID")) || "ไม่ระบุชื่อยุทโธปกรณ์", plateNumber: field(record, "Plate_Number") || field(inventory, "Plate_Number"), ownerCompanyId: field(record, "Owner_Company_ID"), owner: companyNames.get(field(record, "Owner_Company_ID")) || "-", borrowerCompanyId: field(record, "Borrower_Company_ID"), borrower: companyNames.get(field(record, "Borrower_Company_ID")) || "-", operator: operator?.name || "-", operatorPhone: operator?.phone || "", operatorEmail: operator?.email || "", quantity: number(record, "Original_Qty") || number(record, "Qty"), outstandingQuantity, activeBorrow, status, date: field(record, "Borrow_Date"), dueDate: field(record, "Due_Date"), returnDate: field(record, "Return_Date"), note: field(record, "Note"), evidenceImage: movementType === "return" ? field(record, "Return_Evidence_Image", "Return_Evidence", "Returned_Evidence_Image", "Evidence_Image") : field(record, "Evidence_Image") };
  }).sort((a, b) => Date.parse(b.returnDate || b.date) - Date.parse(a.returnDate || a.date));
  const maintenance = maintenanceTable.rows.map(({ record }) => {
    const inventoryId = field(record, "Inv_ID");
    const inventory = inventoryById.get(inventoryId) || {};
    const operator = userDetails.get(field(record, "User_ID"));
    const equipmentId = field(inventory, "Equip_ID");
    return { id: field(record, "Maint_ID"), inventoryId, companyId: field(inventory, "Company_ID"), equipmentName: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์", plateNumber: field(inventory, "Plate_Number"), picture: equipments.find((item) => item.id === equipmentId)?.picture || getEquipmentImage(equipmentNames.get(equipmentId) || ""), companyName: companyNames.get(field(inventory, "Company_ID")) || "-", operator: operator?.name || "-", operatorPhone: operator?.phone || "", operatorEmail: operator?.email || "", quantity: number(record, "Qty"), status: field(record, "Status"), note: field(record, "Note"), date: field(record, "Reported_At"), completedAt: field(record, "Completed_At"), completedBy: userDetails.get(field(record, "Completed_By_User_ID"))?.name || "", evidenceImage: field(record, "Evidence_Image", "Evidence", "Evidence_File") };
  }).sort((a, b) => Date.parse(b.completedAt || b.date) - Date.parse(a.completedAt || a.date));
  const logs = logsTable.rows.map(({ record }) => {
    const target = field(record, "Target_ID");
    const targetInventory = inventoryById.get(target);
    const targetMaintenance = maintenanceById.get(target);
    const targetTransactions = transactionsTable.rows.map(({ record }) => record).filter((transaction) => field(transaction, "Tx_ID") === target || field(transaction, "Group_Tx_ID", "Borrow_Batch_ID", "Return_Group_ID") === target);
    const targetTransaction = transactionById.get(target) || targetTransactions[0];
    const maintenanceInventory = targetMaintenance ? inventoryById.get(field(targetMaintenance, "Inv_ID")) : undefined;
    const companyIds = new Set<string>();
    if (targetInventory) companyIds.add(field(targetInventory, "Company_ID"));
    if (maintenanceInventory) companyIds.add(field(maintenanceInventory, "Company_ID"));
    targetTransactions.forEach((transaction) => { companyIds.add(field(transaction, "Owner_Company_ID")); companyIds.add(field(transaction, "Borrower_Company_ID")); });
    if (targetTransaction) { companyIds.add(field(targetTransaction, "Owner_Company_ID")); companyIds.add(field(targetTransaction, "Borrower_Company_ID")); }
    const targetUser = userDetails.get(target);
    if (targetUser?.companyId) companyIds.add(targetUser.companyId);
    const actor = userDetails.get(field(record, "User_ID"));
    const targetEquipmentId = targetInventory ? field(targetInventory, "Equip_ID") : maintenanceInventory ? field(maintenanceInventory, "Equip_ID") : targetTransaction ? field(inventoryById.get(field(targetTransaction, "Inv_ID")) || {}, "Equip_ID") : "";
    const targetLabel = targetUser?.name || equipmentNames.get(targetEquipmentId) || (targetMaintenance ? `รายการแจ้งซ่อม ${target}` : targetTransaction ? `รายการเบิก/คืน ${target}` : targetInventory ? `รายการคลัง ${target}` : target || "ไม่ระบุเป้าหมาย");
    const resolvedCompanyIds = [...companyIds].filter(Boolean);
    return { id: field(record, "Log_ID"), user: actor?.name || field(record, "User_ID") || "ระบบ", action: field(record, "Action_Type"), target, targetLabel, timestamp: field(record, "Timestamp"), details: resolvedAuditDetails(field(record, "Details"), companyNames, inventoryById, equipmentNames), companyIds: resolvedCompanyIds, companyNames: resolvedCompanyIds.map((id) => companyNames.get(id) || id) };
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const companies = companiesTable.rows.filter(({ record }) => !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active", "Active", "Status").toLowerCase())).map(({ record }) => { const id = field(record, "Company_ID"); const name = field(record, "Company_Name"); const stock = inventories.filter((item) => item.companyId === id); return { id, name, users: users.filter((item) => item.companyId === id).length, total: stock.reduce((sum, item) => sum + item.total, 0), available: stock.reduce((sum, item) => sum + item.available, 0), borrowed: stock.reduce((sum, item) => sum + item.borrowed, 0), broken: stock.reduce((sum, item) => sum + item.broken, 0), transactions: transactions.filter((item) => item.ownerCompanyId === id || item.borrowerCompanyId === id).length }; });
  return { companies, users, equipments, categories, inventories, transactions, maintenance, logs };
}

export async function adminMutation(admin: SessionUser, input: Record<string, unknown>) {
  if (admin.role !== "Admin") throw new Error("ไม่มีสิทธิ์ผู้ดูแลระบบ");
  return withSheetsMutationLock(async () => {
    const action = String(input.action || "");
    const [companySource, users, equipmentSource, inventorySource, transactionSource, maintenanceSource, logsSource, categorySource] = await Promise.all([table("Companies"), table("Users"), equipmentTable(), table("Inventories"), table("Transactions"), table("Maintenance"), table("Audit_Log"), ensureCategoryTable()]);
    const updates: Update[] = [];
    const companies = withColumns(companySource, ["Is_Active"], updates);
    const logs = withColumns(logsSource, ["Details"], updates);
    let maintenance = maintenanceSource;
    const equipments = withColumns(equipmentSource, ["Picture", "Is_Active"], updates);
    const categories = withColumns(categorySource, CATEGORY_HEADERS, updates);
    const inventories = withColumns(inventorySource, ["Asset_Owner_Company_ID", "Stock_Status"], updates);
    let target = String(input.id || "");
    let auditContext: Record<string, string> = {};
    let rangesToClear: string[] = [];
    let lineNotification: LineActivityNotification | null = null;

    if (action === "save-company") {
      target ||= `CMP-${randomUUID().slice(0, 8)}`;
      const row = companies.rows.find(({ record }) => field(record, "Company_ID") === target);
      if (row) updates.push(cell(companies, row.rowNumber, requireColumn(companies, "Company_Name"), String(input.name || "")), cell(companies, row.rowNumber, requireColumn(companies, "Is_Active"), "TRUE"));
      else updates.push(append(companies, valuesFor(companies, { Company_ID: target, Company_Name: String(input.name || ""), Is_Active: "TRUE" })));
    } else if (action === "delete-company") {
      const row = companies.rows.find(({ record }) => field(record, "Company_ID") === target);
      if (!row) throw new Error("ไม่พบกองร้อยที่ต้องการลบ");
      const companyName = field(row.record, "Company_Name");
      if (String(input.confirmName || "").trim() !== companyName) throw new Error("ชื่อกองร้อยที่กรอกเพื่อยืนยันไม่ถูกต้อง");
      const adminRow = users.rows.find(({ record }) => field(record, "User_ID") === admin.userId);
      if (!adminRow || !verifyPassword(String(input.adminPassword || ""), field(adminRow.record, "Password_Hash"))) throw new Error("รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง");
      if (users.rows.some(({ record }) => field(record, "Company_ID") === target)) throw new Error("ไม่สามารถลบกองร้อยที่ยังมีผู้ใช้งาน กรุณาย้ายหรือลบผู้ใช้ก่อน");
      if (inventories.rows.some(({ record }) => field(record, "Company_ID") === target && number(record, "Qty_Total") > 0)) throw new Error("ไม่สามารถลบกองร้อยที่ยังมียุทโธปกรณ์ กรุณาเคลื่อนย้ายหรือลบรายการคลังก่อน");
      if (transactionSource.rows.some(({ record }) => [field(record, "Owner_Company_ID"), field(record, "Borrower_Company_ID")].includes(target) && ["borrowed", "overdue"].includes(field(record, "Status").toLowerCase()) && field(record, "Transaction_Type").toLowerCase() !== "return")) throw new Error("ไม่สามารถลบกองร้อยที่ยังมีรายการยืมค้างอยู่");
      updates.push(cell(companies, row.rowNumber, requireColumn(companies, "Is_Active"), "FALSE"));
      auditContext = { companyName };
    } else if (action === "save-user") {
      target ||= `USR-${randomUUID().slice(0, 8)}`;
      const row = users.rows.find(({ record }) => field(record, "User_ID") === target);
      const payload: Record<string, string | number> = { User_ID: target, Company_ID: String(input.companyId || ""), Role: String(input.role || "User"), Rank: String(input.rank || ""), First_Name: String(input.firstName || ""), Last_Name: String(input.lastName || ""), Email: String(input.email || "").toLowerCase(), Phone: String(input.phone || ""), Gmail: String(input.gmail || "").toLowerCase() };
      if (String(input.password || "")) payload.Password_Hash = hashPassword(String(input.password));
      if (row) Object.entries(payload).filter(([key]) => key !== "User_ID").forEach(([key, value]) => { const index = col(users.headers, key); if (index >= 0) updates.push(cell(users, row.rowNumber, index, value)); });
      else { if (!payload.Password_Hash) throw new Error("ผู้ใช้ใหม่ต้องกำหนดรหัสผ่าน"); updates.push(append(users, valuesFor(users, payload))); }
    } else if (action === "delete-user") {
      if (target === admin.userId) throw new Error("ไม่สามารถลบบัญชีผู้ดูแลที่กำลังใช้งานอยู่");
      const row = users.rows.find(({ record }) => field(record, "User_ID") === target);
      if (!row) throw new Error("ไม่พบผู้ใช้งาน");
      auditContext = { userName: `${field(row.record, "Rank")} ${field(row.record, "First_Name")} ${field(row.record, "Last_Name")}`.trim(), companyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === field(row.record, "Company_ID"))?.record || {}, "Company_Name") };
      updates.push({ range: `'${users.name}'!A${row.rowNumber}:${letter(users.headers.length - 1)}${row.rowNumber}`, values: [users.headers.map(() => "")] });
    } else if (action === "save-category") {
      target ||= `CAT-${randomUUID().slice(0, 8)}`;
      const row = categories.rows.find(({ record }) => field(record, "Category_ID", "ID") === target);
      const oldName = row ? field(row.record, "Category_Name", "Category", "Name") : String(input.oldName || "").trim();
      const name = String(input.name || "").trim();
      const icon = String(input.icon || "Boxes").trim();
      if (!name) throw new Error("กรุณาระบุชื่อหมวดหมู่");
      if (categories.rows.some(({ record }) => field(record, "Category_ID", "ID") !== target && field(record, "Category_Name", "Category", "Name").toLocaleLowerCase("th") === name.toLocaleLowerCase("th") && !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active", "Active", "Status").toLowerCase()))) throw new Error("ชื่อหมวดหมู่นี้มีอยู่แล้ว");
      const payload = { Category_ID: target, Category_Name: name, Icon: icon, Is_Active: "TRUE" };
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(categories, row.rowNumber, requireColumn(categories, key), value)));
      else updates.push(append(categories, valuesFor(categories, payload)));
      if (oldName && oldName !== name) equipments.rows.filter(({ record }) => field(record, "Category") === oldName).forEach((equipment) => updates.push(cell(equipments, equipment.rowNumber, requireColumn(equipments, "Category"), name)));
      auditContext = { equipmentName: name };
    } else if (action === "save-equipment") {
      target ||= `EQ-${randomUUID().slice(0, 8)}`;
      const row = equipments.rows.find(({ record }) => field(record, "Equip_ID") === target);
      const picture = String(input.picture || "");
      if (picture.startsWith("data:image/") && picture.length > 45_000) throw new Error("รูปยุทโธปกรณ์มีขนาดใหญ่เกินไป");
      const category = String(input.category || "").trim();
      const knownCategory = categories.rows.some(({ record }) => field(record, "Category_Name", "Category", "Name") === category && !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active", "Active", "Status").toLowerCase())) || equipments.rows.some(({ record }) => field(record, "Category") === category);
      if (!knownCategory) throw new Error("กรุณาเลือกหมวดหมู่ที่มีอยู่ หรือเพิ่มหมวดหมู่ใหม่ก่อน");
      const payload = { Equip_ID: target, Equip_Name: String(input.name || ""), Category: category, Require_Plate: input.requirePlate ? "TRUE" : "FALSE", Picture: picture || getEquipmentImage(String(input.name || "")), Is_Active: "TRUE" };
      if (row) Object.entries(payload).slice(1).forEach(([key, value]) => updates.push(cell(equipments, row.rowNumber, requireColumn(equipments, key), value)));
      else updates.push(append(equipments, valuesFor(equipments, payload)));
    } else if (action === "delete-equipment") {
      const row = equipments.rows.find(({ record }) => field(record, "Equip_ID") === target);
      if (!row) throw new Error("ไม่พบชนิดยุทโธปกรณ์ที่ต้องการลบ");
      if (inventories.rows.some(({ record }) => field(record, "Equip_ID") === target && number(record, "Qty_Total") > 0)) throw new Error("ไม่สามารถลบยุทโธปกรณ์ที่ยังมียอดอยู่ในคลัง กรุณาเคลื่อนย้ายหรือลบยอดคลังก่อน");
      updates.push(cell(equipments, row.rowNumber, requireColumn(equipments, "Is_Active"), "FALSE"));
      auditContext = { equipmentName: field(row.record, "Equip_Name") };
    } else if (action === "delete-equipment-category") {
      const category = String(input.category || "").trim();
      const categoryRow = categories.rows.find(({ record }) => field(record, "Category_ID", "ID") === target || field(record, "Category_Name", "Category", "Name") === category);
      if (!category || !categoryRow) throw new Error("ไม่พบหมวดหมู่ยุทโธปกรณ์ที่ต้องการลบ");
      if (equipments.rows.some(({ record }) => field(record, "Category") === category && !["false", "0", "deleted", "inactive"].includes(field(record, "Is_Active").toLowerCase()))) throw new Error("ไม่สามารถลบหมวดหมู่ที่ยังมียุทโธปกรณ์อยู่ กรุณาย้ายยุทโธปกรณ์ไปหมวดหมู่อื่นก่อน");
      updates.push(cell(categories, categoryRow.rowNumber, requireColumn(categories, "Is_Active"), "FALSE"));
      target = field(categoryRow.record, "Category_ID", "ID") || `CATEGORY:${category}`;
      auditContext = { equipmentName: category };
    } else if (action === "batch-adjust-inventory") {
      const requested = Array.isArray(input.items) ? input.items as Array<{ id?: unknown; total?: unknown; plateNumber?: unknown }> : [];
      if (!requested.length || requested.length > 200) throw new Error("กรุณาเลือกยุทโธปกรณ์ 1-200 รายการ");
      const uniqueIds = new Set<string>();
      requested.forEach((item) => uniqueIds.add(String(item.id || "")));
      if (uniqueIds.has("") || uniqueIds.size !== requested.length) throw new Error("พบรายการคลังซ้ำหรือไม่ถูกต้อง");
      const requestedSerials = new Set<string>();
      const changedNames: string[] = [];
      for (const requestedItem of requested) {
        const inventoryId = String(requestedItem.id || "");
        const row = inventories.rows.find(({ record }) => field(record, "Inv_ID") === inventoryId);
        if (!row) throw new Error(`ไม่พบรายการคลัง ${inventoryId}`);
        const equipmentId = field(row.record, "Equip_ID");
        const equipment = equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId);
        const requirePlate = ["true", "1", "yes"].includes(field(equipment?.record || {}, "Require_Plate").toLowerCase());
        const nextTotal = Math.floor(Number(requestedItem.total));
        const borrowed = number(row.record, "Qty_Borrowed");
        const broken = number(row.record, "Qty_Broken");
        const minimum = Math.max(1, borrowed + broken);
        if (!Number.isInteger(nextTotal) || nextTotal < minimum) throw new Error(`${field(equipment?.record || {}, "Equip_Name") || inventoryId} ต้องมีจำนวนไม่น้อยกว่า ${minimum}`);
        if (requirePlate && nextTotal !== 1) throw new Error(`${field(equipment?.record || {}, "Equip_Name") || inventoryId} เป็นรายการ Serial จึงต้องมีจำนวน 1`);
        const currentPlateNumber = field(row.record, "Plate_Number");
        const nextPlateNumber = requirePlate ? String(requestedItem.plateNumber ?? currentPlateNumber).trim() : "";
        if (requirePlate && !nextPlateNumber) throw new Error(`${field(equipment?.record || {}, "Equip_Name") || inventoryId} ต้องระบุ Serial/ทะเบียน`);
        if (requirePlate) {
          const serialKey = `${equipmentId}:${nextPlateNumber.toLowerCase()}`;
          if (requestedSerials.has(serialKey) || inventories.rows.some(({ record }) => !uniqueIds.has(field(record, "Inv_ID")) && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number").toLowerCase() === nextPlateNumber.toLowerCase())) throw new Error(`Serial/ทะเบียน ${nextPlateNumber} ถูกใช้งานอยู่แล้ว`);
          requestedSerials.add(serialKey);
          if (nextPlateNumber.toLowerCase() !== currentPlateNumber.toLowerCase()) {
            const hasActiveMovement = transactionSource.rows.some(({ record }) => ["borrowed", "overdue"].includes(field(record, "Status").toLowerCase()) && field(record, "Transaction_Type").toLowerCase() !== "return" && [field(record, "Inv_ID"), field(record, "Destination_Inventory_ID", "Borrower_Inventory_ID")].includes(inventoryId));
            if (borrowed > 0 || hasActiveMovement) throw new Error(`${field(equipment?.record || {}, "Equip_Name") || inventoryId} กำลังถูกยืม จึงยังแก้ Serial ไม่ได้`);
            updates.push(cell(inventories, row.rowNumber, requireColumn(inventories, "Plate_Number"), nextPlateNumber));
          }
        }
        updates.push(
          cell(inventories, row.rowNumber, requireColumn(inventories, "Qty_Total"), nextTotal),
          cell(inventories, row.rowNumber, requireColumn(inventories, "Qty_Available"), nextTotal - borrowed - broken),
        );
        changedNames.push(`${field(equipment?.record || {}, "Equip_Name") || inventoryId}: ${number(row.record, "Qty_Total")}→${nextTotal}${requirePlate && nextPlateNumber !== currentPlateNumber ? ` · Serial ${currentPlateNumber}→${nextPlateNumber}` : ""}`);
      }
      target = `INVENTORY_BATCH:${uniqueIds.size}`;
      auditContext = { quantity: String(uniqueIds.size), equipmentName: changedNames.slice(0, 20).join(", ") };
    } else if (action === "batch-add-inventory") {
      const requestedItems = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : [];
      if (!requestedItems.length || requestedItems.length > 200) throw new Error("กรุณาเพิ่มรายการครั้งละ 1-200 รายการ");
      const projectedExisting = new Map<number, { row: RecordRow; total: number; available: number }>();
      const newRows = new Map<string, { id: string; companyId: string; companyName: string; equipmentId: string; plateNumber: string; total: number; equipmentName: string }>();
      const serials = new Set<string>();
      const changedNames: string[] = [];
      for (const requested of requestedItems) {
        const companyId = String(requested.companyId || "");
        const equipmentId = String(requested.equipmentId || "");
        const companyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name");
        const equipment = equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId);
        if (!companyName) throw new Error("พบรายการที่ไม่มีกองร้อยปลายทาง");
        if (!equipment) throw new Error("พบชนิดยุทโธปกรณ์ที่ไม่มีในบัญชีแม่");
        const equipmentName = field(equipment.record, "Equip_Name");
        const requirePlate = ["true", "1", "yes"].includes(field(equipment.record, "Require_Plate").toLowerCase());
        const plateNumber = requirePlate ? String(requested.plateNumber || "").trim() : "";
        const quantity = Math.floor(Number(requested.total));
        if (!Number.isInteger(quantity) || quantity < 1 || (requirePlate && quantity !== 1)) throw new Error(`${equipmentName} ระบุจำนวนไม่ถูกต้อง`);
        if (requirePlate && !plateNumber) throw new Error(`${equipmentName} ต้องระบุ Serial/ทะเบียน`);
        const serialKey = `${equipmentId}:${plateNumber.toLowerCase()}`;
        if (requirePlate) {
          if (serials.has(serialKey) || inventories.rows.some(({ record }) => field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number").toLowerCase() === plateNumber.toLowerCase())) throw new Error(`Serial/ทะเบียน ${plateNumber} ถูกใช้งานอยู่แล้ว`);
          serials.add(serialKey);
        }
        const existing = inventories.rows.find(({ record }) => field(record, "Company_ID") === companyId && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number") === plateNumber && field(record, "Stock_Status").toLowerCase() !== "borrowed" && (!field(record, "Asset_Owner_Company_ID") || field(record, "Asset_Owner_Company_ID") === companyId));
        if (existing) {
          const projected = projectedExisting.get(existing.rowNumber) || { row: existing, total: number(existing.record, "Qty_Total"), available: number(existing.record, "Qty_Available") };
          projected.total += quantity;
          projected.available += quantity;
          projectedExisting.set(existing.rowNumber, projected);
        } else {
          const key = requirePlate ? serialKey : `${companyId}:${equipmentId}`;
          const pending = newRows.get(key);
          if (pending) pending.total += quantity;
          else newRows.set(key, { id: `INV-${randomUUID().slice(0, 8)}`, companyId, companyName, equipmentId, plateNumber, total: quantity, equipmentName });
        }
        changedNames.push(`${equipmentName} → ${companyName} +${quantity}`);
      }
      projectedExisting.forEach(({ row, total, available }) => updates.push(
        cell(inventories, row.rowNumber, requireColumn(inventories, "Qty_Total"), total),
        cell(inventories, row.rowNumber, requireColumn(inventories, "Qty_Available"), available),
      ));
      let inventoryRowNumber = Math.max(1, ...inventories.rows.map((row) => row.rowNumber)) + 1;
      newRows.forEach((item) => {
        updates.push({ range: `'${inventories.name}'!A${inventoryRowNumber}:${letter(inventories.headers.length - 1)}${inventoryRowNumber}`, values: [valuesFor(inventories, { Inv_ID: item.id, Company_ID: item.companyId, Company_Name: item.companyName, Asset_Owner_Company_ID: item.companyId, Stock_Status: "Owned", Equip_ID: item.equipmentId, Plate_Number: item.plateNumber, Qty_Total: item.total, Qty_Available: item.total, Qty_Borrowed: 0, Qty_Broken: 0 })] });
        inventoryRowNumber += 1;
      });
      target = `INVENTORY_BATCH_ADD:${requestedItems.length}`;
      auditContext = { quantity: String(requestedItems.length), equipmentName: changedNames.slice(0, 40).join(", ") };
    } else if (action === "save-inventory" || action === "add-inventory") {
      const adding = action === "add-inventory";
      if (!adding && !target) throw new Error("กรุณาเลือกรายการในคลังที่ต้องการจัดการ");
      target ||= `INV-${randomUUID().slice(0, 8)}`;
      const row = inventories.rows.find(({ record }) => field(record, "Inv_ID") === target);
      const companyId = String(input.companyId || "");
      const equipmentId = String(input.equipmentId || "");
      const equipment = equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId);
      if (!equipment) throw new Error("ไม่พบชนิดยุทโธปกรณ์");
      const requirePlate = ["true", "1", "yes"].includes(field(equipment.record, "Require_Plate").toLowerCase());
      const companyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name");
      const plateNumber = requirePlate ? String(input.plateNumber || "").trim() : "";
      if (requirePlate && !plateNumber) throw new Error("ยุทโธปกรณ์ชนิดนี้ต้องระบุทะเบียนหรือหมายเลขประจำรายการ");
      const inputTotal = Math.floor(Number(input.total));
      if (!Number.isInteger(inputTotal) || inputTotal < 1) throw new Error("กรุณากรอกจำนวนรวมอย่างน้อย 1");
      if (requirePlate && inputTotal !== 1) throw new Error("ยุทโธปกรณ์ที่มี Serial/ทะเบียนต้องมีจำนวน 1 ต่อรายการ");
      if (requirePlate && inventories.rows.some(({ record }) => field(record, "Inv_ID") !== target && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number").toLowerCase() === plateNumber.toLowerCase())) {
        throw new Error("Serial/ทะเบียนนี้ถูกใช้งานอยู่แล้ว กรุณาตรวจสอบเลขให้ถูกต้อง");
      }
      if (adding) {
        const existing = inventories.rows.find(({ record }) => field(record, "Company_ID") === companyId && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number") === plateNumber && field(record, "Stock_Status").toLowerCase() !== "borrowed" && (!field(record, "Asset_Owner_Company_ID") || field(record, "Asset_Owner_Company_ID") === companyId));
        if (requirePlate && inputTotal !== 1) throw new Error("ยุทโธปกรณ์แบบแยกรายคันเพิ่มได้ครั้งละ 1 รายการ");
        if (existing) {
          updates.push(cell(inventories, existing.rowNumber, requireColumn(inventories, "Qty_Total"), number(existing.record, "Qty_Total") + inputTotal), cell(inventories, existing.rowNumber, requireColumn(inventories, "Qty_Available"), number(existing.record, "Qty_Available") + inputTotal));
          target = field(existing.record, "Inv_ID");
        } else updates.push(append(inventories, valuesFor(inventories, { Inv_ID: target, Company_ID: companyId, Company_Name: companyName, Asset_Owner_Company_ID: companyId, Stock_Status: "Owned", Equip_ID: equipmentId, Plate_Number: plateNumber, Qty_Total: inputTotal, Qty_Available: inputTotal, Qty_Borrowed: 0, Qty_Broken: 0 })));
      } else {
        if (!row) throw new Error("ไม่พบรายการในคลัง");
        const borrowed = number(row.record, "Qty_Borrowed");
        const broken = number(row.record, "Qty_Broken");
        const currentPlateNumber = field(row.record, "Plate_Number");
        const serialChanged = requirePlate && currentPlateNumber.toLowerCase() !== plateNumber.toLowerCase();
        const hasActiveMovement = transactionSource.rows.some(({ record }) =>
          ["borrowed", "overdue"].includes(field(record, "Status").toLowerCase()) &&
          field(record, "Transaction_Type").toLowerCase() !== "return" &&
          [field(record, "Inv_ID"), field(record, "Destination_Inventory_ID", "Borrower_Inventory_ID")].includes(target),
        );
        if (serialChanged && (borrowed > 0 || hasActiveMovement)) throw new Error("ไม่สามารถแก้ Serial/ทะเบียนระหว่างที่รายการกำลังถูกยืม กรุณารับคืนให้เสร็จก่อน");
        if (inputTotal < borrowed + broken) throw new Error(`จำนวนรวมต้องไม่น้อยกว่า ${borrowed + broken} รายการ`);
        const payload = { Company_ID: companyId, Company_Name: companyName, Equip_ID: equipmentId, Plate_Number: plateNumber, Qty_Total: inputTotal, Qty_Available: inputTotal - borrowed - broken };
        Object.entries(payload).forEach(([key, value]) => updates.push(cell(inventories, row.rowNumber, requireColumn(inventories, key), value)));
      }
    } else if (action === "transfer-inventory") {
      const source = inventories.rows.find(({ record }) => field(record, "Inv_ID") === String(input.sourceInventoryId || ""));
      const destinationCompanyId = String(input.destinationCompanyId || "");
      const quantity = Math.floor(Number(input.quantity));
      if (!source) throw new Error("ไม่พบรายการคลังต้นทาง");
      const sourceCompanyId = field(source.record, "Company_ID");
      const sourceAssetOwnerCompanyId = field(source.record, "Asset_Owner_Company_ID");
      if (field(source.record, "Stock_Status").toLowerCase() === "borrowed") throw new Error("ไม่สามารถเคลื่อนย้ายของยืมมาได้ ต้องคืนเจ้าของเดิมก่อน");
      if (sourceAssetOwnerCompanyId && sourceAssetOwnerCompanyId !== sourceCompanyId) throw new Error("ไม่สามารถเคลื่อนย้ายยุทโธปกรณ์ที่กองร้อยนี้รับยืมมาได้ ต้องคืนเจ้าของเดิมก่อน");
      const sourceEquipmentId = field(source.record, "Equip_ID");
      const sourcePlateNumber = field(source.record, "Plate_Number");
      const activeInbound = transactionSource.rows.some(({ record }) => {
        if (field(record, "Transaction_Type").toLowerCase() === "return" || !["borrowed", "overdue"].includes(field(record, "Status").toLowerCase())) return false;
        if (field(record, "Borrower_Company_ID") !== sourceCompanyId || field(record, "Owner_Company_ID") === sourceCompanyId) return false;
        const origin = inventories.rows.find(({ record: inventory }) => field(inventory, "Inv_ID") === field(record, "Inv_ID"));
        const transactionEquipmentId = field(record, "Equip_ID") || field(origin?.record || {}, "Equip_ID");
        const transactionPlateNumber = field(record, "Plate_Number") || field(origin?.record || {}, "Plate_Number");
        return transactionEquipmentId === sourceEquipmentId && (!transactionPlateNumber || transactionPlateNumber === sourcePlateNumber);
      });
      if (activeInbound) throw new Error("ไม่สามารถเคลื่อนย้ายยุทโธปกรณ์ที่กำลังยืมจากกองร้อยอื่น ต้องคืนเจ้าของเดิมก่อน");
      if (!destinationCompanyId || destinationCompanyId === sourceCompanyId) throw new Error("กรุณาเลือกกองร้อยปลายทางที่ต่างจากต้นทาง");
      const available = number(source.record, "Qty_Available");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error(`ย้ายได้สูงสุด ${available} รายการ`);
      const equipmentId = sourceEquipmentId;
      const plateNumber = sourcePlateNumber;
      const destinationCompanyName = field(companies.rows.find(({ record }) => field(record, "Company_ID") === destinationCompanyId)?.record || {}, "Company_Name");
      if (!destinationCompanyName) throw new Error("ไม่พบกองร้อยปลายทาง");
      const destination = inventories.rows.find(({ record }) => field(record, "Company_ID") === destinationCompanyId && field(record, "Equip_ID") === equipmentId && field(record, "Plate_Number") === plateNumber && field(record, "Stock_Status").toLowerCase() !== "borrowed" && (!field(record, "Asset_Owner_Company_ID") || field(record, "Asset_Owner_Company_ID") === destinationCompanyId));
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
        updates.push(append(inventories, valuesFor(inventories, { Inv_ID: `INV-${randomUUID().slice(0, 8)}`, Company_ID: destinationCompanyId, Company_Name: destinationCompanyName, Asset_Owner_Company_ID: destinationCompanyId, Stock_Status: "Owned", Equip_ID: equipmentId, Plate_Number: plateNumber, Qty_Total: quantity, Qty_Available: quantity, Qty_Borrowed: 0, Qty_Broken: 0 })));
      }
      target = field(source.record, "Inv_ID");
    } else if (action === "delete-inventory") {
      const row = inventories.rows.find(({ record }) => field(record, "Inv_ID") === target);
      if (!row) throw new Error("ไม่พบรายการในคลัง");
      if (number(row.record, "Qty_Borrowed") > 0) throw new Error("ไม่สามารถลบรายการที่ยังมีจำนวนถูกยืมอยู่");
      if (number(row.record, "Qty_Broken") > 0) throw new Error("ไม่สามารถลบรายการที่ยังอยู่ระหว่างแจ้งซ่อมหรือซ่อมบำรุง");
      auditContext = { equipmentName: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === field(row.record, "Equip_ID"))?.record || {}, "Equip_Name"), companyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === field(row.record, "Company_ID"))?.record || {}, "Company_Name"), plateNumber: field(row.record, "Plate_Number") };
      updates.push({ range: `'${inventories.name}'!A${row.rowNumber}:${letter(inventories.headers.length - 1)}${row.rowNumber}`, values: [inventories.headers.map(() => "")] });
    } else if (action === "return-transaction") {
      const transactions = withColumns(transactionSource, ["Transaction_Type", "Parent_Tx_ID", "Original_Qty", "Outstanding_Qty", "Return_Group_ID", "Return_Date", "Return_User_ID", "Return_Evidence_Image"], updates);
      const transaction = transactions.rows.find(({ record }) => field(record, "Tx_ID") === target && field(record, "Transaction_Type").toLowerCase() !== "return");
      if (!transaction) throw new Error("ไม่พบรายการที่กำลังยืม");
      if (!["borrowed", "overdue"].includes(field(transaction.record, "Status").toLowerCase())) throw new Error("รายการนี้ถูกคืนหรือดำเนินการแล้ว");
      const ownerCompanyId = field(transaction.record, "Owner_Company_ID");
      const borrowerCompanyId = field(transaction.record, "Borrower_Company_ID");
      const sourceInventoryId = field(transaction.record, "Inv_ID");
      const destinationInventoryId = field(transaction.record, "Destination_Inventory_ID", "Borrower_Inventory_ID");
      const equipmentId = field(transaction.record, "Equip_ID");
      const transactionPlateNumber = field(transaction.record, "Plate_Number");
      const quantity = number(transaction.record, "Outstanding_Qty") || number(transaction.record, "Qty");
      const originalQuantity = number(transaction.record, "Original_Qty") || number(transaction.record, "Qty");
      const source = inventories.rows.find(({ record }) => field(record, "Inv_ID") === sourceInventoryId) || inventories.rows.find(({ record }) => field(record, "Company_ID") === ownerCompanyId && field(record, "Equip_ID") === equipmentId && (!transactionPlateNumber || field(record, "Plate_Number") === transactionPlateNumber));
      const resolvedEquipmentId = equipmentId || field(source?.record || {}, "Equip_ID");
      const plateNumber = transactionPlateNumber || field(source?.record || {}, "Plate_Number");
      const destination = inventories.rows.find(({ record }) => field(record, "Inv_ID") === destinationInventoryId && field(record, "Company_ID") === borrowerCompanyId) || inventories.rows
        .filter(({ record }) => field(record, "Company_ID") === borrowerCompanyId && field(record, "Equip_ID") === resolvedEquipmentId && (!plateNumber || field(record, "Plate_Number") === plateNumber))
        .sort((first, second) => {
          const score = ({ record }: RecordRow) => {
            const assetOwner = field(record, "Asset_Owner_Company_ID", "Stock_Owner_Company_ID", "Original_Owner_Company_ID");
            if (assetOwner === ownerCompanyId) return 0;
            if (field(record, "Stock_Status", "Inventory_Status").toLowerCase() === "borrowed") return 1;
            return 2;
          };
          return score(first) - score(second);
        })[0];
      if (!source || !destination || quantity < 1) throw new Error("ไม่พบข้อมูลคลังต้นทางหรือปลายทางสำหรับคืนยุทโธปกรณ์");
      const selfUse = ownerCompanyId === borrowerCompanyId && source.rowNumber === destination.rowNumber;
      const sourceAvailable = number(source.record, "Qty_Available");
      const sourceBorrowed = number(source.record, "Qty_Borrowed");
      if (selfUse) {
        updates.push(cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Available"), sourceAvailable + quantity), cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Borrowed"), Math.max(0, sourceBorrowed - quantity)));
      } else {
        const destinationTotal = number(destination.record, "Qty_Total");
        const destinationAvailable = number(destination.record, "Qty_Available");
        if (destinationTotal < quantity) {
          const chained = transactionSource.rows.find(({ record }) => {
            if (field(record, "Tx_ID") === target || field(record, "Owner_Company_ID") !== borrowerCompanyId || !["borrowed", "overdue"].includes(field(record, "Status").toLowerCase()) || field(record, "Transaction_Type").toLowerCase() === "return") return false;
            const chainedSource = inventories.rows.find(({ record: inventory }) => field(inventory, "Inv_ID") === field(record, "Inv_ID"));
            const chainedEquipmentId = field(record, "Equip_ID") || field(chainedSource?.record || {}, "Equip_ID");
            const chainedPlateNumber = field(record, "Plate_Number") || field(chainedSource?.record || {}, "Plate_Number");
            return (!resolvedEquipmentId || chainedEquipmentId === resolvedEquipmentId) && (!plateNumber || chainedPlateNumber === plateNumber);
          });
          if (chained) { const nextCompanyId = field(chained.record, "Borrower_Company_ID"); throw new Error(`ยุทโธปกรณ์รายการนี้ถูกเบิกต่อไปยัง ${field(companies.rows.find(({ record }) => field(record, "Company_ID") === nextCompanyId)?.record || {}, "Company_Name") || nextCompanyId} ต้องคืนรายการ ${field(chained.record, "Tx_ID")} ก่อน`); }
          throw new Error("ยอดรวมในคลังผู้ยืมไม่เพียงพอสำหรับการคืน กรุณาตรวจสอบการเคลื่อนย้ายย้อนหลัง");
        }
        updates.push(
          cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Total"), number(source.record, "Qty_Total") + quantity),
          cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Available"), sourceAvailable + quantity),
          cell(inventories, source.rowNumber, requireColumn(inventories, "Qty_Borrowed"), Math.max(0, sourceBorrowed - quantity)),
          cell(inventories, destination.rowNumber, requireColumn(inventories, "Qty_Total"), destinationTotal - quantity),
          cell(inventories, destination.rowNumber, requireColumn(inventories, "Qty_Available"), Math.max(0, destinationAvailable - quantity)),
        );
        if (field(destination.record, "Asset_Owner_Company_ID", "Stock_Owner_Company_ID", "Original_Owner_Company_ID") && field(destination.record, "Asset_Owner_Company_ID", "Stock_Owner_Company_ID", "Original_Owner_Company_ID") !== borrowerCompanyId) {
          updates.push(cell(inventories, destination.rowNumber, requireColumn(inventories, "Stock_Status"), destinationTotal - quantity > 0 ? "Borrowed" : "Returned"));
        }
      }
      const now = new Date().toISOString();
      const returnGroupId = `RET-${randomUUID()}`;
      updates.push(
        cell(transactions, transaction.rowNumber, requireColumn(transactions, "Transaction_Type"), "BORROW"),
        cell(transactions, transaction.rowNumber, requireColumn(transactions, "Original_Qty"), originalQuantity),
        cell(transactions, transaction.rowNumber, requireColumn(transactions, "Outstanding_Qty"), 0),
        cell(transactions, transaction.rowNumber, requireColumn(transactions, "Status"), "Returned"),
        append(transactions, valuesFor(transactions, { Tx_ID: `${returnGroupId}-1`, Group_Tx_ID: returnGroupId, Return_Group_ID: returnGroupId, Transaction_Type: "RETURN", Parent_Tx_ID: target, Owner_Company_ID: ownerCompanyId, Borrower_Company_ID: borrowerCompanyId, User_ID: admin.userId, Inv_ID: sourceInventoryId, Destination_Inventory_ID: destinationInventoryId, Equip_ID: resolvedEquipmentId, Plate_Number: plateNumber, Qty: quantity, Original_Qty: quantity, Outstanding_Qty: 0, Borrow_Date: now, Return_Date: now, Return_User_ID: admin.userId, Status: "Returned", Note: `ผู้ดูแลระบบคืนยุทโธปกรณ์จากรายการ ${target}` })),
      );
      auditContext = { equipmentName: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === resolvedEquipmentId)?.record || {}, "Equip_Name"), companyName: `${field(companies.rows.find(({ record }) => field(record, "Company_ID") === borrowerCompanyId)?.record || {}, "Company_Name")} → ${field(companies.rows.find(({ record }) => field(record, "Company_ID") === ownerCompanyId)?.record || {}, "Company_Name")}`, quantity: String(quantity) };
      lineNotification = { kind: "return", actorName: [admin.rank, admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email, ownerCompanyId, ownerCompanyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === ownerCompanyId)?.record || {}, "Company_Name") || ownerCompanyId, borrowerCompanyId, borrowerCompanyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === borrowerCompanyId)?.record || {}, "Company_Name") || borrowerCompanyId, referenceId: returnGroupId, occurredAt: now, items: [{ name: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === resolvedEquipmentId)?.record || {}, "Equip_Name") || "ไม่ระบุชื่อยุทโธปกรณ์", quantity, plateNumber }] };
    } else if (action === "delete-transaction-history") {
      const requestedIds = new Set((Array.isArray(input.ids) ? input.ids : [input.id]).map(String).filter(Boolean));
      const isActiveBorrow = ({ record }: RecordRow) => {
        if (field(record, "Transaction_Type").toLowerCase() === "return" || !["borrowed", "overdue"].includes(field(record, "Status").toLowerCase())) return false;
        if ((number(record, "Outstanding_Qty") || number(record, "Qty")) < 1) return false;
        const sourceInventory = inventories.rows.find(({ record: inventory }) => field(inventory, "Inv_ID") === field(record, "Inv_ID"));
        return Boolean(sourceInventory && number(sourceInventory.record, "Qty_Borrowed") > 0);
      };
      const selectedRows = input.all === true
        ? transactionSource.rows.filter((row) => !isActiveBorrow(row))
        : transactionSource.rows.filter(({ record }) => requestedIds.has(field(record, "Tx_ID")));
      if (!selectedRows.length) throw new Error("ไม่พบประวัติเบิกคืนที่สามารถล้างได้");
      if (selectedRows.some(isActiveBorrow)) throw new Error("ไม่สามารถลบรายการที่ยังยืมค้างหรือเกินกำหนดได้ กรุณาคืนยุทโธปกรณ์ให้เสร็จก่อน");
      rangesToClear = rangesForRows(transactionSource, selectedRows.map((row) => row.rowNumber));
      target = selectedRows.length === 1 ? field(selectedRows[0].record, "Tx_ID") : `TRANSACTION_HISTORY:${selectedRows.length}`;
      auditContext = { quantity: String(selectedRows.length), scope: input.all === true ? "ประวัติที่ปิดงานแล้วทั้งหมด" : "รายการที่เลือก" };
    } else if (action === "report-defect") {
      const inventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === String(input.inventoryId || input.id || ""));
      if (!inventory) throw new Error("ไม่พบยุทโธปกรณ์ในคลังที่ต้องการแจ้งเสีย");
      const quantity = Math.floor(Number(input.quantity));
      const available = number(inventory.record, "Qty_Available");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error(`แจ้งเสียได้สูงสุด ${available} รายการ`);
      const evidenceImage = String(input.evidenceImage || "");
      if (!evidenceImage.startsWith("data:image/") || evidenceImage.length > 45_000) throw new Error("กรุณาแนบรูปหลักฐานการแจ้งเสีย");
      maintenance = withColumns(maintenance, ["Evidence_Image"], updates);
      target = `MNT-${randomUUID()}`;
      updates.push(
        cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Available"), available - quantity),
        cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Broken"), number(inventory.record, "Qty_Broken") + quantity),
        append(maintenance, valuesFor(maintenance, { Maint_ID: target, Inv_ID: field(inventory.record, "Inv_ID"), User_ID: admin.userId, Qty: quantity, Status: "Reported", Note: String(input.note || "แจ้งผ่าน AI ผู้ช่วยผู้ดูแลระบบ"), Reported_At: new Date().toISOString(), Evidence_Image: evidenceImage })),
      );
      const equipmentId = field(inventory.record, "Equip_ID");
      auditContext = { equipmentName: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId)?.record || {}, "Equip_Name"), companyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === field(inventory.record, "Company_ID"))?.record || {}, "Company_Name"), plateNumber: field(inventory.record, "Plate_Number") };
      lineNotification = { kind: "defect", actorName: [admin.rank, admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email, ownerCompanyId: field(inventory.record, "Company_ID"), ownerCompanyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === field(inventory.record, "Company_ID"))?.record || {}, "Company_Name") || field(inventory.record, "Company_ID"), referenceId: target, occurredAt: new Date().toISOString(), note: String(input.note || "แจ้งผ่าน AI ผู้ช่วยผู้ดูแลระบบ"), items: [{ name: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId)?.record || {}, "Equip_Name") || "ไม่ระบุชื่อยุทโธปกรณ์", quantity, plateNumber: field(inventory.record, "Plate_Number") }] };
    } else if (action === "maintenance-status") {
      const row = maintenance.rows.find(({ record }) => field(record, "Maint_ID") === target);
      if (!row) throw new Error("ไม่พบรายการซ่อม");
      const currentStatus = field(row.record, "Status").toLowerCase();
      const nextStatus = String(input.status || "Reported");
      if (currentStatus === "completed" && nextStatus.toLowerCase() !== "completed") throw new Error("งานที่ซ่อมเสร็จแล้วไม่สามารถย้อนสถานะได้");
      if (["completed", "rejected"].includes(nextStatus.toLowerCase()) && !["completed", "rejected"].includes(currentStatus)) {
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
      const notificationInventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === field(row.record, "Inv_ID"));
      if (notificationInventory) {
        const equipmentId = field(row.record, "Equip_ID") || field(notificationInventory.record, "Equip_ID");
        const companyId = field(notificationInventory.record, "Company_ID");
        const statusLabel: Record<string, string> = { reported: "แจ้งเสีย", inspecting: "กำลังตรวจสอบ", inprogress: "กำลังดำเนินการ", completed: "ซ่อมเสร็จแล้ว", rejected: "ไม่รับรายการแจ้งเสีย", disposed: "จำหน่ายแล้ว" };
        lineNotification = { kind: "defect", actorName: [admin.rank, admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email, ownerCompanyId: companyId, ownerCompanyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name") || companyId, referenceId: target, occurredAt: new Date().toISOString(), note: `อัปเดตสถานะซ่อม: ${statusLabel[nextStatus.toLowerCase().replace(/[\s_-]/g, "")] || nextStatus}`, items: [{ name: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId)?.record || {}, "Equip_Name") || "ไม่ระบุชื่อยุทโธปกรณ์", quantity: number(row.record, "Qty"), plateNumber: field(notificationInventory.record, "Plate_Number") }] };
      }
    } else if (action === "dispose-maintenance") {
      const row = maintenance.rows.find(({ record }) => field(record, "Maint_ID") === target);
      if (!row) throw new Error("ไม่พบรายการซ่อม");
      if (["completed", "disposed"].includes(field(row.record, "Status").toLowerCase())) throw new Error("รายการนี้ปิดดำเนินการแล้ว");
      const inventory = inventories.rows.find(({ record }) => field(record, "Inv_ID") === field(row.record, "Inv_ID"));
      if (!inventory) throw new Error("ไม่พบคลังเดิมของยุทโธปกรณ์");
      const quantity = number(row.record, "Qty");
      const broken = number(inventory.record, "Qty_Broken");
      const total = number(inventory.record, "Qty_Total");
      if (quantity < 1 || broken < quantity || total < quantity) throw new Error("ยอดชำรุดไม่เพียงพอสำหรับการจำหน่าย");
      maintenance = withColumns(maintenance, ["Completed_At", "Completed_By_User_ID"], updates);
      updates.push(cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Broken"), broken - quantity), cell(inventories, inventory.rowNumber, requireColumn(inventories, "Qty_Total"), total - quantity), cell(maintenance, row.rowNumber, requireColumn(maintenance, "Status"), "Disposed"), cell(maintenance, row.rowNumber, requireColumn(maintenance, "Completed_At"), new Date().toISOString()), cell(maintenance, row.rowNumber, requireColumn(maintenance, "Completed_By_User_ID"), admin.userId));
      const equipmentId = field(row.record, "Equip_ID") || field(inventory.record, "Equip_ID");
      const companyId = field(inventory.record, "Company_ID");
      lineNotification = { kind: "defect", actorName: [admin.rank, admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email, ownerCompanyId: companyId, ownerCompanyName: field(companies.rows.find(({ record }) => field(record, "Company_ID") === companyId)?.record || {}, "Company_Name") || companyId, referenceId: target, occurredAt: new Date().toISOString(), note: "จำหน่ายยุทโธปกรณ์ชำรุดแล้ว", items: [{ name: field(equipments.rows.find(({ record }) => field(record, "Equip_ID") === equipmentId)?.record || {}, "Equip_Name") || "ไม่ระบุชื่อยุทโธปกรณ์", quantity, plateNumber: field(inventory.record, "Plate_Number") }] };
    } else {
      throw new Error("คำสั่งไม่ถูกต้อง");
    }

    const safeDetails = { ...Object.fromEntries(Object.entries(input).filter(([key]) => !key.toLowerCase().includes("password"))), ...auditContext };
    updates.push(append(logs, valuesFor(logs, { Log_ID: `LOG-${randomUUID()}`, User_ID: admin.userId, Action_Type: `ADMIN_${action.toUpperCase().replace(/-/g, "_")}`, Target_ID: target, Timestamp: new Date().toISOString(), Details: JSON.stringify(safeDetails) })));
    const undoRecord = await prepareAdminUndoRecord(admin, action, target, updates, rangesToClear);
    if (undoRecord) updates.push(undoRecord.update);
    await clearRanges(rangesToClear);
    await write(updates);
    if (!lineNotification) {
      const actionLabels: Record<string, string> = {
        "save-company": "บันทึกข้อมูลกองร้อย", "delete-company": "ลบกองร้อย", "save-user": "บันทึกผู้ใช้งาน", "delete-user": "ลบผู้ใช้งาน",
        "save-equipment": "บันทึกยุทโธปกรณ์", "save-category": "บันทึกหมวดหมู่ยุทโธปกรณ์", "delete-equipment": "ลบชนิดยุทโธปกรณ์", "delete-equipment-category": "ลบหมวดหมู่ยุทโธปกรณ์",
        "save-inventory": "แก้ไขคลังยุทโธปกรณ์", "batch-adjust-inventory": "ปรับจำนวนยุทโธปกรณ์หลายรายการ", "add-inventory": "เพิ่มยุทโธปกรณ์เข้าคลัง", "batch-add-inventory": "เพิ่มยุทโธปกรณ์หลายรายการเข้าคลัง", "transfer-inventory": "เคลื่อนย้ายยุทโธปกรณ์",
        "delete-inventory": "ลบรายการคลัง", "delete-transaction-history": "ล้างประวัติเบิกคืน",
      };
      lineNotification = { kind: "admin", actorName: [admin.rank, admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email, ownerCompanyName: auditContext.companyName || "ส่วนกลาง", referenceId: target, occurredAt: new Date().toISOString(), note: actionLabels[action] || action, adminOnly: true, items: auditContext.equipmentName ? [{ name: auditContext.equipmentName, quantity: Number(auditContext.quantity) || 1, plateNumber: auditContext.plateNumber }] : [] };
    }
    if (lineNotification) await sendLineActivityNotification(lineNotification);
    return { success: true, id: target, undoId: undoRecord?.id || null };
  });
}
