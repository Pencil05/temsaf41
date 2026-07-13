import "server-only";

import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type Row = { record: Record<string, string>; rowNumber: number };
type Table = { name: string; headers: string[]; rows: Row[] };
type Update = { range: string; values: Array<Array<string | number>> };
type Field = { aliases: string[]; value: string | number };

export type DashboardActionData = {
  companies: Array<{ id: string; name: string }>;
  returns: Array<{ transactionId: string; name: string; quantity: number; ownerCompanyId: string; ownerCompanyName: string }>;
  defects: Array<{ sourceType: "inventory" | "borrowed"; sourceId: string; name: string; maximum: number; label: string }>;
};

export class InventoryActionError extends Error {}

const keyOf = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");

function value(record: Record<string, string>, ...names: string[]) {
  const key = Object.keys(record).find((candidate) => names.some((name) => keyOf(candidate) === keyOf(name)));
  return key ? record[key] : "";
}

function numberValue(record: Record<string, string>, ...names: string[]) {
  const parsed = Number(value(record, ...names).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function column(headers: string[], ...names: string[]) {
  return headers.findIndex((header) => names.some((name) => keyOf(header) === keyOf(name)));
}

function letter(index: number) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function nextRow(table: Table) {
  return Math.max(1, ...table.rows.map((row) => row.rowNumber)) + 1;
}

function rowValues(headers: string[], fields: Field[]) {
  return headers.map((header) => fields.find(({ aliases }) => aliases.some((alias) => keyOf(alias) === keyOf(header)))?.value ?? "");
}

function config() {
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();
  if (!email || !privateKey || !spreadsheetId || !privateKey.includes("BEGIN PRIVATE KEY")) throw new Error("Google Sheets credentials are invalid.");
  return { email, privateKey, spreadsheetId };
}

async function sheetsClient() {
  const { email, privateKey } = config();
  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

async function readTable(name: string): Promise<Table> {
  const sheets = await sheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: config().spreadsheetId, range: `'${name}'!A:ZZ` });
  const [rawHeaders = [], ...rawRows] = response.data.values ?? [];
  const headers = rawHeaders.map((header) => String(header).trim());
  const rows = rawRows.map((raw, index) => ({ raw, rowNumber: index + 2 }))
    .filter(({ raw }) => raw.some((cell) => cell !== "" && cell !== undefined))
    .map(({ raw, rowNumber }) => ({
      rowNumber,
      record: headers.reduce<Record<string, string>>((record, header, index) => {
        if (header) record[header] = String(raw[index] ?? "").trim();
        return record;
      }, {}),
    }));
  return { name, headers, rows };
}

async function readEquipmentTable() {
  const equipments = await readTable("Equipments");
  return equipments.rows.length ? equipments : readTable("Master_Equipments");
}

function cell(table: Table, rowNumber: number, columnIndex: number, newValue: string | number): Update {
  if (columnIndex < 0) throw new Error(`Required column missing in ${table.name}.`);
  return { range: `'${table.name}'!${letter(columnIndex)}${rowNumber}`, values: [[newValue]] };
}

function append(table: Table, values: Array<string | number>): Update {
  const rowNumber = nextRow(table);
  return { range: `'${table.name}'!A${rowNumber}:${letter(table.headers.length - 1)}${rowNumber}`, values: [values] };
}

async function write(updates: Update[]) {
  const sheets = await sheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config().spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: updates },
  });
}

function inventoryKey(row: Row) {
  return value(row.record, "Inventory_ID", "InventoryId", "ID") || `row-${row.rowNumber}`;
}

export async function getDashboardActionData(user: SessionUser): Promise<DashboardActionData> {
  const [companiesTable, equipmentTable, inventories, transactions] = await Promise.all([
    readTable("Companies"), readEquipmentTable(), readTable("Inventories"), readTable("Transactions"),
  ]);
  const companies = companiesTable.rows.map(({ record }) => ({
    id: value(record, "Company_ID", "CompanyId", "ID"),
    name: value(record, "Company_Name", "CompanyName", "Name"),
  })).filter((company) => company.id && company.name);
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const equipmentNames = new Map(equipmentTable.rows.map(({ record }) => [
    value(record, "Equip_ID", "Equipment_ID", "EquipId", "ID"),
    value(record, "Equip_Name", "Equipment_Name", "EquipName", "Name") || "ไม่ระบุชื่อ",
  ]));
  const returns = transactions.rows.filter(({ record }) =>
    value(record, "User_ID", "UserId") === user.userId && value(record, "Status").toLowerCase() === "borrowed",
  ).map(({ record }) => {
    const equipmentId = value(record, "Equip_ID", "Equipment_ID", "EquipId");
    const ownerCompanyId = value(record, "Owner_Company_ID", "OwnerCompanyId");
    return {
      transactionId: value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID"),
      name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อ",
      quantity: numberValue(record, "Qty", "Quantity"),
      ownerCompanyId,
      ownerCompanyName: companyNames.get(ownerCompanyId) || ownerCompanyId,
    };
  });
  const defects: DashboardActionData["defects"] = inventories.rows.filter(({ record }) =>
    value(record, "Company_ID", "CompanyId") === user.companyId,
  ).map((row) => ({
    sourceType: "inventory" as const,
    sourceId: inventoryKey(row),
    name: equipmentNames.get(value(row.record, "Equip_ID", "Equipment_ID", "EquipId")) || "ไม่ระบุชื่อ",
    maximum: numberValue(row.record, "Qty_Available", "Available_Quantity"),
    label: "ในคลัง",
  })).filter((item) => item.maximum > 0);
  defects.push(...returns.map((item) => ({
    sourceType: "borrowed" as const,
    sourceId: item.transactionId,
    name: item.name,
    maximum: item.quantity,
    label: "กำลังยืม",
  })));
  return { companies, returns, defects };
}

export async function returnEquipment(
  user: SessionUser,
  input: { transactionId: string; destinationCompanyId: string },
) {
  return withSheetsMutationLock(async () => {
    const [transactions, inventories, audits] = await Promise.all([
      readTable("Transactions"), readTable("Inventories"), readTable("Audit_Log"),
    ]);
    const transaction = transactions.rows.find(({ record }) =>
      value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID") === input.transactionId,
    );
    if (!transaction || value(transaction.record, "User_ID", "UserId") !== user.userId) throw new InventoryActionError("ไม่พบรายการที่กำลังยืม");
    if (value(transaction.record, "Status").toLowerCase() !== "borrowed") throw new InventoryActionError("รายการนี้ถูกดำเนินการแล้ว");
    const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
    if (input.destinationCompanyId !== ownerCompanyId) throw new InventoryActionError("ต้องคืนให้หน่วยเจ้าของเดิม");
    const equipmentId = value(transaction.record, "Equip_ID", "Equipment_ID", "EquipId");
    const sourceInventoryId = value(transaction.record, "Inventory_ID", "InventoryId");
    const destinationInventoryId = value(transaction.record, "Destination_Inventory_ID", "Borrower_Inventory_ID");
    const borrowerCompanyId = value(transaction.record, "Borrower_Company_ID", "BorrowerCompanyId");
    const sourceInventory = inventories.rows.find((row) =>
      (sourceInventoryId && inventoryKey(row) === sourceInventoryId) ||
      (value(row.record, "Company_ID", "CompanyId") === ownerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId),
    );
    const destinationInventory = inventories.rows.find((row) =>
      (destinationInventoryId && inventoryKey(row) === destinationInventoryId) ||
      (value(row.record, "Company_ID", "CompanyId") === borrowerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId),
    );
    if (!sourceInventory || !destinationInventory) throw new InventoryActionError("ไม่พบคลังต้นทางหรือปลายทาง");
    const quantity = numberValue(transaction.record, "Qty", "Quantity");
    const sourceTotal = numberValue(sourceInventory.record, "Qty_Total", "Total_Quantity");
    const sourceAvailable = numberValue(sourceInventory.record, "Qty_Available", "Available_Quantity");
    const sourceBorrowed = numberValue(sourceInventory.record, "Qty_Borrowed", "Borrowed_Quantity");
    const destinationTotal = numberValue(destinationInventory.record, "Qty_Total", "Total_Quantity");
    const destinationAvailable = numberValue(destinationInventory.record, "Qty_Available", "Available_Quantity");
    if (destinationAvailable < quantity || destinationTotal < quantity) {
      throw new InventoryActionError("จำนวนในคลังปลายทางไม่เพียงพอสำหรับการคืน");
    }
    const now = new Date().toISOString();
    const updates: Update[] = [
      cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Total", "Total_Quantity"), sourceTotal + quantity),
      cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), sourceAvailable + quantity),
      cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity"), Math.max(0, sourceBorrowed - quantity)),
      cell(inventories, destinationInventory.rowNumber, column(inventories.headers, "Qty_Total", "Total_Quantity"), destinationTotal - quantity),
      cell(inventories, destinationInventory.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), destinationAvailable - quantity),
      cell(transactions, transaction.rowNumber, column(transactions.headers, "Status"), "Returned"),
    ];
    const returnDateColumn = column(transactions.headers, "Return_Date", "Returned_At");
    if (returnDateColumn >= 0) updates.push(cell(transactions, transaction.rowNumber, returnDateColumn, now));
    updates.push(append(audits, rowValues(audits.headers, [
      { aliases: ["Audit_ID", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "RETURN" },
      { aliases: ["Table_Name", "Target_Table"], value: "Transactions" },
      { aliases: ["Record_ID", "Tx_ID"], value: input.transactionId },
      { aliases: ["Details", "Description"], value: `Returned ${quantity} item(s)` },
    ])));
    await write(updates);
    return { success: true };
  });
}

export async function reportDefect(
  user: SessionUser,
  input: { sourceType: "inventory" | "borrowed"; sourceId: string; quantity: number; note?: string },
) {
  return withSheetsMutationLock(async () => {
    const [inventories, transactions, maintenance, audits] = await Promise.all([
      readTable("Inventories"), readTable("Transactions"), readTable("Maintenance"), readTable("Audit_Log"),
    ]);
    const quantity = Math.floor(Number(input.quantity));
    if (!Number.isInteger(quantity) || quantity < 1) throw new InventoryActionError("จำนวนไม่ถูกต้อง");
    let inventory: Row | undefined;
    let equipmentId = "";
    let maximum = 0;
    let sourceColumn = -1;
    const updates: Update[] = [];

    if (input.sourceType === "inventory") {
      inventory = inventories.rows.find((row) => inventoryKey(row) === input.sourceId && value(row.record, "Company_ID", "CompanyId") === user.companyId);
      if (!inventory) throw new InventoryActionError("ไม่พบรายการในคลัง");
      equipmentId = value(inventory.record, "Equip_ID", "Equipment_ID", "EquipId");
      maximum = numberValue(inventory.record, "Qty_Available", "Available_Quantity");
      sourceColumn = column(inventories.headers, "Qty_Available", "Available_Quantity");
    } else {
      const transaction = transactions.rows.find(({ record }) =>
        value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID") === input.sourceId &&
        value(record, "User_ID", "UserId") === user.userId && value(record, "Status").toLowerCase() === "borrowed",
      );
      if (!transaction) throw new InventoryActionError("ไม่พบรายการที่กำลังยืม");
      equipmentId = value(transaction.record, "Equip_ID", "Equipment_ID", "EquipId");
      const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
      const inventoryId = value(transaction.record, "Inventory_ID", "InventoryId");
      inventory = inventories.rows.find((row) =>
        (inventoryId && inventoryKey(row) === inventoryId) ||
        (value(row.record, "Company_ID", "CompanyId") === ownerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId),
      );
      if (!inventory) throw new InventoryActionError("ไม่พบคลังต้นทาง");
      maximum = numberValue(transaction.record, "Qty", "Quantity");
      sourceColumn = column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity");
      const remaining = maximum - quantity;
      updates.push(cell(transactions, transaction.rowNumber, column(transactions.headers, "Qty", "Quantity"), Math.max(0, remaining)));
      if (remaining === 0) updates.push(cell(transactions, transaction.rowNumber, column(transactions.headers, "Status"), "Defective"));
    }
    if (quantity > maximum) throw new InventoryActionError(`จำนวนสูงสุดคือ ${maximum}`);
    const sourceValue = input.sourceType === "inventory"
      ? numberValue(inventory.record, "Qty_Available", "Available_Quantity")
      : numberValue(inventory.record, "Qty_Borrowed", "Borrowed_Quantity");
    const broken = numberValue(inventory.record, "Qty_Broken", "Broken_Quantity");
    updates.push(
      cell(inventories, inventory.rowNumber, sourceColumn, Math.max(0, sourceValue - quantity)),
      cell(inventories, inventory.rowNumber, column(inventories.headers, "Qty_Broken", "Broken_Quantity"), broken + quantity),
    );
    const now = new Date().toISOString();
    const maintenanceId = `MNT-${crypto.randomUUID()}`;
    updates.push(append(maintenance, rowValues(maintenance.headers, [
      { aliases: ["Maintenance_ID", "ID"], value: maintenanceId },
      { aliases: ["Inventory_ID", "InventoryId"], value: value(inventory.record, "Inventory_ID", "InventoryId", "ID") },
      { aliases: ["Equip_ID", "Equipment_ID"], value: equipmentId },
      { aliases: ["Company_ID", "CompanyId"], value: value(inventory.record, "Company_ID", "CompanyId") },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Qty", "Quantity"], value: quantity },
      { aliases: ["Report_Date", "Created_At", "Date"], value: now },
      { aliases: ["Status"], value: "Reported" },
      { aliases: ["Note", "Details", "Description"], value: input.note?.trim() || "" },
    ])));
    updates.push(append(audits, rowValues(audits.headers, [
      { aliases: ["Audit_ID", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "REPORT_DEFECT" },
      { aliases: ["Table_Name", "Target_Table"], value: "Maintenance" },
      { aliases: ["Record_ID"], value: maintenanceId },
      { aliases: ["Details", "Description"], value: `Reported ${quantity} broken item(s)` },
    ])));
    await write(updates);
    return { success: true };
  });
}
