import "server-only";

import { google } from "googleapis";
import { getAccountById } from "@/lib/account-service";
import type { SessionUser } from "@/lib/auth-session";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type Row = { record: Record<string, string>; rowNumber: number };
type Table = { name: string; headers: string[]; rows: Row[] };
type Update = { range: string; values: Array<Array<string | number>> };
type Field = { aliases: string[]; value: string | number };
type CachedValue<T> = { value: T; expiresAt: number };

const TABLE_CACHE_TTL_MS = 0;
const tableCache = new Map<string, CachedValue<Table>>();
const pendingTableReads = new Map<string, Promise<Table>>();

export type DashboardActionData = {
  userName: string;
  companyName: string;
  contactPhone: string;
  contactEmail: string;
  companies: Array<{ id: string; name: string }>;
  returns: Array<{ transactionId: string; name: string; quantity: number; ownerCompanyId: string; ownerCompanyName: string; selfUse: boolean }>;
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
  const cacheKey = `table:${name}`;
  const cached = tableCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = pendingTableReads.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
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
      const table = { name, headers, rows };
      tableCache.set(cacheKey, { value: table, expiresAt: Date.now() + TABLE_CACHE_TTL_MS });
      return table;
    } catch (error) {
      console.error("Google Sheets lookup failed", error);
      return { name, headers: [], rows: [] };
    } finally {
      pendingTableReads.delete(cacheKey);
    }
  })();

  pendingTableReads.set(cacheKey, promise);
  return promise;
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

function withColumns(table: Table, columns: string[], updates: Update[]) {
  const headers = [...table.headers];
  for (const name of columns) {
    if (column(headers, name) < 0) {
      updates.push(cell(table, 1, headers.length, name));
      headers.push(name);
    }
  }
  return { ...table, headers };
}

async function write(updates: Update[]) {
  const sheets = await sheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config().spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: updates },
  });
  tableCache.clear();
}

function inventoryKey(row: Row) {
  return value(row.record, "Inv_ID", "Inventory_ID", "InventoryId", "ID") || `row-${row.rowNumber}`;
}

function inferLegacySourceInventory(transaction: Row, inventories: Row[]) {
  const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
  const quantity = numberValue(transaction.record, "Qty", "Quantity");
  const candidates = inventories.filter(({ record }) =>
    value(record, "Company_ID", "CompanyId") === ownerCompanyId &&
    numberValue(record, "Qty_Borrowed", "Borrowed_Quantity") >= quantity,
  );

  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function getDashboardActionData(user: SessionUser): Promise<DashboardActionData> {
  const [companiesTable, equipmentTable, inventories, transactions, account] = await Promise.all([
    readTable("Companies"), readEquipmentTable(), readTable("Inventories"), readTable("Transactions"),
    getAccountById(user.userId),
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
  const equipmentIdByInventoryId = new Map(inventories.rows.map((row) => [
    inventoryKey(row),
    value(row.record, "Equip_ID", "Equipment_ID", "EquipId"),
  ]));
  const returns = transactions.rows.filter(({ record }) =>
    value(record, "Borrower_Company_ID", "BorrowerCompanyId") === user.companyId &&
    ["borrowed", "overdue"].includes(value(record, "Status").toLowerCase()),
  ).map((transaction) => {
    const { record } = transaction;
    const inferredInventory = inferLegacySourceInventory(transaction, inventories.rows);
    const equipmentId =
      value(record, "Equip_ID", "Equipment_ID", "EquipId") ||
      equipmentIdByInventoryId.get(value(record, "Inv_ID", "Inventory_ID", "InventoryId")) ||
      value(inferredInventory?.record ?? {}, "Equip_ID", "Equipment_ID", "EquipId") ||
      "";
    const ownerCompanyId = value(record, "Owner_Company_ID", "OwnerCompanyId");
    return {
      transactionId: value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID"),
      name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อ",
      quantity: numberValue(record, "Qty", "Quantity"),
      ownerCompanyId,
      ownerCompanyName: companyNames.get(ownerCompanyId) || ownerCompanyId,
      selfUse: ownerCompanyId === value(record, "Borrower_Company_ID", "BorrowerCompanyId"),
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
  return {
    userName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    companyName: companyNames.get(user.companyId) || user.companyId,
    contactPhone: account?.phone || "",
    contactEmail: account?.gmail || account?.email || user.email,
    companies,
    returns,
    defects,
  };
}

export async function returnEquipment(
  user: SessionUser,
  input: { transactionId: string; quantity: number; evidenceImage?: string },
) {
  return withSheetsMutationLock(async () => {
    const [transactionSource, inventories, audits] = await Promise.all([
      readTable("Transactions"), readTable("Inventories"), readTable("Audit_Log"),
    ]);
    const evidenceImage = String(input.evidenceImage || "");
    if (evidenceImage && (!evidenceImage.startsWith("data:image/jpeg;base64,") || evidenceImage.length > 45_000)) {
      throw new InventoryActionError("รูปหลักฐานการคืนไม่ถูกต้องหรือมีขนาดใหญ่เกินไป");
    }
    const updates: Update[] = [];
    const transactions = withColumns(transactionSource, ["Return_Evidence_Image"], updates);
    const transaction = transactions.rows.find(({ record }) =>
      value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID") === input.transactionId,
    );
    if (!transaction) throw new InventoryActionError("ไม่พบรายการที่กำลังยืม");
    if (!["borrowed", "overdue"].includes(value(transaction.record, "Status").toLowerCase())) throw new InventoryActionError("รายการนี้ถูกดำเนินการแล้ว");
    const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
    const sourceInventoryId = value(transaction.record, "Inv_ID", "Inventory_ID", "InventoryId");
    const destinationInventoryId = value(transaction.record, "Destination_Inventory_ID", "Borrower_Inventory_ID");
    const borrowerCompanyId = value(transaction.record, "Borrower_Company_ID", "BorrowerCompanyId");
    const plateNumber = value(transaction.record, "Plate_Number", "PlateNumber");
    if (borrowerCompanyId !== user.companyId) throw new InventoryActionError("หน่วยของคุณไม่มีสิทธิ์คืนรายการนี้");
    const directEquipmentId = value(transaction.record, "Equip_ID", "Equipment_ID", "EquipId");
    const sourceInventory = inventories.rows.find((row) =>
      sourceInventoryId && inventoryKey(row) === sourceInventoryId &&
      (!plateNumber || value(row.record, "Plate_Number", "PlateNumber") === plateNumber),
    ) ||
      inventories.rows.find((row) =>
        directEquipmentId && value(row.record, "Company_ID", "CompanyId") === ownerCompanyId &&
        value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === directEquipmentId &&
        (!plateNumber || value(row.record, "Plate_Number", "PlateNumber") === plateNumber),
      ) || inferLegacySourceInventory(transaction, inventories.rows);
    const equipmentId = directEquipmentId || value(sourceInventory?.record ?? {}, "Equip_ID", "Equipment_ID", "EquipId");
    const destinationInventory = inventories.rows.find((row) =>
      ((destinationInventoryId && inventoryKey(row) === destinationInventoryId) ||
      (value(row.record, "Company_ID", "CompanyId") === borrowerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId)) &&
      (!plateNumber || value(row.record, "Plate_Number", "PlateNumber") === plateNumber),
    );
    if (!sourceInventory || !destinationInventory) throw new InventoryActionError("ไม่พบคลังต้นทางหรือปลายทาง");
    const selfUse = ownerCompanyId === borrowerCompanyId && sourceInventory.rowNumber === destinationInventory.rowNumber;
    const borrowedQuantity = numberValue(transaction.record, "Qty", "Quantity");
    const quantity = Math.floor(Number(input.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > borrowedQuantity) {
      throw new InventoryActionError(`คืนได้สูงสุด ${borrowedQuantity} รายการ`);
    }
    const remainingQuantity = borrowedQuantity - quantity;
    const sourceTotal = numberValue(sourceInventory.record, "Qty_Total", "Total_Quantity");
    const sourceAvailable = numberValue(sourceInventory.record, "Qty_Available", "Available_Quantity");
    const sourceBorrowed = numberValue(sourceInventory.record, "Qty_Borrowed", "Borrowed_Quantity");
    const destinationTotal = numberValue(destinationInventory.record, "Qty_Total", "Total_Quantity");
    const destinationAvailable = numberValue(destinationInventory.record, "Qty_Available", "Available_Quantity");
    if (!selfUse && (destinationAvailable < quantity || destinationTotal < quantity)) {
      throw new InventoryActionError("จำนวนในคลังปลายทางไม่เพียงพอสำหรับการคืน");
    }
    const now = new Date().toISOString();
    if (selfUse) {
      updates.push(
        cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), sourceAvailable + quantity),
        cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity"), Math.max(0, sourceBorrowed - quantity)),
      );
    } else {
      updates.push(
        cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Total", "Total_Quantity"), sourceTotal + quantity),
        cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), sourceAvailable + quantity),
        cell(inventories, sourceInventory.rowNumber, column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity"), Math.max(0, sourceBorrowed - quantity)),
        cell(inventories, destinationInventory.rowNumber, column(inventories.headers, "Qty_Total", "Total_Quantity"), destinationTotal - quantity),
        cell(inventories, destinationInventory.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), destinationAvailable - quantity),
      );
    }
    updates.push(
      cell(transactions, transaction.rowNumber, column(transactions.headers, "Qty", "Quantity"), remainingQuantity || quantity),
      cell(transactions, transaction.rowNumber, column(transactions.headers, "Status"), remainingQuantity === 0 ? "Returned" : "Borrowed"),
    );
    const returnDateColumn = column(transactions.headers, "Return_Date", "Returned_At");
    if (returnDateColumn >= 0) updates.push(cell(transactions, transaction.rowNumber, returnDateColumn, now));
    const returnUserColumn = column(transactions.headers, "Return_User_ID", "Returned_By_User_ID");
    if (returnUserColumn >= 0) updates.push(cell(transactions, transaction.rowNumber, returnUserColumn, user.userId));
    const returnEvidenceColumn = column(transactions.headers, "Return_Evidence_Image", "Return_Evidence", "Returned_Evidence_Image");
    if (returnEvidenceColumn >= 0) updates.push(cell(transactions, transaction.rowNumber, returnEvidenceColumn, evidenceImage));
    updates.push(append(audits, rowValues(audits.headers, [
      { aliases: ["Log_ID", "Audit_ID", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "RETURN" },
      { aliases: ["Table_Name", "Target_Table"], value: "Transactions" },
      { aliases: ["Target_ID", "Record_ID", "Tx_ID"], value: input.transactionId },
      { aliases: ["Details", "Description"], value: `Returned ${quantity} item(s)` },
    ])));
    await write(updates);
    return { success: true };
  });
}

export async function reportDefect(
  user: SessionUser,
  input: { sourceType: "inventory" | "borrowed"; sourceId: string; quantity: number; note?: string; evidenceImage?: string },
) {
  return withSheetsMutationLock(async () => {
    if (input.sourceType !== "inventory") throw new InventoryActionError("แจ้งซ่อมได้เฉพาะยุทโธปกรณ์ที่เป็นของกองร้อยตนเอง");
    const [inventories, transactions, maintenanceSource, audits] = await Promise.all([
      readTable("Inventories"), readTable("Transactions"), readTable("Maintenance"), readTable("Audit_Log"),
    ]);
    const evidenceImage = String(input.evidenceImage || "");
    if (!evidenceImage.startsWith("data:image/jpeg;base64,") || evidenceImage.length > 45_000) {
      throw new InventoryActionError("กรุณาแนบรูปหลักฐานการแจ้งเสียที่ถูกต้อง");
    }
    const updates: Update[] = [];
    const maintenance = withColumns(maintenanceSource, ["Evidence_Image"], updates);
    const quantity = Math.floor(Number(input.quantity));
    if (!Number.isInteger(quantity) || quantity < 1) throw new InventoryActionError("จำนวนไม่ถูกต้อง");
    let inventory: Row | undefined;
    let equipmentId = "";
    let maximum = 0;
    let sourceColumn = -1;

    if (input.sourceType === "inventory") {
      inventory = inventories.rows.find((row) => inventoryKey(row) === input.sourceId && value(row.record, "Company_ID", "CompanyId") === user.companyId);
      if (!inventory) throw new InventoryActionError("ไม่พบรายการในคลัง");
      equipmentId = value(inventory.record, "Equip_ID", "Equipment_ID", "EquipId");
      maximum = numberValue(inventory.record, "Qty_Available", "Available_Quantity");
      sourceColumn = column(inventories.headers, "Qty_Available", "Available_Quantity");
    } else {
      const transaction = transactions.rows.find(({ record }) =>
        value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID") === input.sourceId &&
        value(record, "Borrower_Company_ID", "BorrowerCompanyId") === user.companyId &&
        value(record, "Status").toLowerCase() === "borrowed",
      );
      if (!transaction) throw new InventoryActionError("ไม่พบรายการที่กำลังยืม");
      equipmentId = value(transaction.record, "Equip_ID", "Equipment_ID", "EquipId");
      const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = value(transaction.record, "Borrower_Company_ID", "BorrowerCompanyId");
      const inventoryId = value(transaction.record, "Inv_ID", "Inventory_ID", "InventoryId");
      const sourceInventory = inventories.rows.find((row) =>
        (inventoryId && inventoryKey(row) === inventoryId) ||
        (value(row.record, "Company_ID", "CompanyId") === ownerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId),
      ) || inferLegacySourceInventory(transaction, inventories.rows);
      equipmentId = equipmentId || value(sourceInventory?.record ?? {}, "Equip_ID", "Equipment_ID", "EquipId");
      inventory = inventories.rows.find((row) =>
        value(row.record, "Company_ID", "CompanyId") === borrowerCompanyId &&
        value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId,
      );
      if (!sourceInventory || !inventory) throw new InventoryActionError("ไม่พบคลังต้นทางหรือปลายทาง");
      maximum = numberValue(transaction.record, "Qty", "Quantity");
      sourceColumn = column(inventories.headers, "Qty_Available", "Available_Quantity");
      const sourceBorrowed = numberValue(sourceInventory.record, "Qty_Borrowed", "Borrowed_Quantity");
      updates.push(cell(
        inventories,
        sourceInventory.rowNumber,
        column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity"),
        Math.max(0, sourceBorrowed - quantity),
      ));
      const remaining = maximum - quantity;
      updates.push(cell(transactions, transaction.rowNumber, column(transactions.headers, "Qty", "Quantity"), Math.max(0, remaining)));
      if (remaining === 0) updates.push(cell(transactions, transaction.rowNumber, column(transactions.headers, "Status"), "Defective"));
    }
    if (quantity > maximum) throw new InventoryActionError(`จำนวนสูงสุดคือ ${maximum}`);
    const sourceValue = numberValue(inventory.record, "Qty_Available", "Available_Quantity");
    const broken = numberValue(inventory.record, "Qty_Broken", "Broken_Quantity");
    updates.push(
      cell(inventories, inventory.rowNumber, sourceColumn, Math.max(0, sourceValue - quantity)),
      cell(inventories, inventory.rowNumber, column(inventories.headers, "Qty_Broken", "Broken_Quantity"), broken + quantity),
    );
    const now = new Date().toISOString();
    const maintenanceId = `MNT-${crypto.randomUUID()}`;
    updates.push(append(maintenance, rowValues(maintenance.headers, [
      { aliases: ["Maint_ID", "Maintenance_ID", "ID"], value: maintenanceId },
      { aliases: ["Inv_ID", "Inventory_ID", "InventoryId"], value: value(inventory.record, "Inv_ID", "Inventory_ID", "InventoryId", "ID") },
      { aliases: ["Equip_ID", "Equipment_ID"], value: equipmentId },
      { aliases: ["Company_ID", "CompanyId"], value: value(inventory.record, "Company_ID", "CompanyId") },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Qty", "Quantity"], value: quantity },
      { aliases: ["Reported_At", "Report_Date", "Created_At", "Date"], value: now },
      { aliases: ["Status"], value: "Reported" },
      { aliases: ["Note", "Details", "Description"], value: input.note?.trim() || "" },
      { aliases: ["Evidence_Image", "Evidence", "Evidence_File"], value: evidenceImage },
    ])));
    updates.push(append(audits, rowValues(audits.headers, [
      { aliases: ["Log_ID", "Audit_ID", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "REPORT_DEFECT" },
      { aliases: ["Table_Name", "Target_Table"], value: "Maintenance" },
      { aliases: ["Target_ID", "Record_ID"], value: maintenanceId },
      { aliases: ["Details", "Description"], value: `Reported ${quantity} broken item(s)` },
    ])));
    await write(updates);
    return { success: true };
  });
}
