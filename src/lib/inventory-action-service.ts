import "server-only";

import { google } from "googleapis";
import { getAccountById } from "@/lib/account-service";
import type { SessionUser } from "@/lib/auth-session";
import { sendLineActivityNotification } from "@/lib/line-oa-notification";
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
  returns: Array<{ transactionId: string; name: string; quantity: number; ownerCompanyId: string; ownerCompanyName: string; selfUse: boolean; plateNumber: string; picture: string }>;
  defects: Array<{ sourceType: "inventory" | "borrowed"; sourceId: string; name: string; maximum: number; label: string; plateNumber: string; picture: string }>;
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
  const equipmentPictures = new Map(equipmentTable.rows.map(({ record }) => [
    value(record, "Equip_ID", "Equipment_ID", "EquipId", "ID"),
    value(record, "Picture", "Image", "Image_URL"),
  ]));
  const equipmentIdByInventoryId = new Map(inventories.rows.map((row) => [
    inventoryKey(row),
    value(row.record, "Equip_ID", "Equipment_ID", "EquipId"),
  ]));
  const returns = transactions.rows.filter(({ record }) =>
    value(record, "Transaction_Type").toLowerCase() !== "return" &&
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
    const plateNumber = value(record, "Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial") || value(inferredInventory?.record ?? {}, "Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial");
    return {
      transactionId: value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID"),
      name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อ",
      quantity: numberValue(record, "Outstanding_Qty") || numberValue(record, "Qty", "Quantity"),
      ownerCompanyId,
      ownerCompanyName: companyNames.get(ownerCompanyId) || ownerCompanyId,
      selfUse: ownerCompanyId === value(record, "Borrower_Company_ID", "BorrowerCompanyId"),
      plateNumber,
      picture: equipmentPictures.get(equipmentId) || "",
    };
  });
  const defects: DashboardActionData["defects"] = inventories.rows.filter(({ record }) =>
    value(record, "Company_ID", "CompanyId") === user.companyId,
  ).map((row) => {
    const equipmentId = value(row.record, "Equip_ID", "Equipment_ID", "EquipId");
    const plateNumber = value(row.record, "Plate_Number", "PlateNumber");
    return {
    sourceType: "inventory" as const,
    sourceId: inventoryKey(row),
    name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อ",
    maximum: numberValue(row.record, "Qty_Available", "Available_Quantity"),
    label: plateNumber ? `ทะเบียน/หมายเลข ${plateNumber}` : "ในคลัง",
    plateNumber,
    picture: equipmentPictures.get(equipmentId) || "",
  }; }).filter((item) => item.maximum > 0);
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
  input: { transactionId?: string; quantity?: number; items?: Array<{ transactionId: string; quantity: number }>; evidenceImage?: string },
) {
  const outcome = await withSheetsMutationLock(async () => {
    const [transactionSource, inventories, audits, companies, equipments] = await Promise.all([
      readTable("Transactions"), readTable("Inventories"), readTable("Audit_Log"), readTable("Companies"), readEquipmentTable(),
    ]);
    const companyNames = new Map(companies.rows.map(({ record }) => [value(record, "Company_ID", "CompanyId", "ID"), value(record, "Company_Name", "CompanyName", "Name")]));
    const equipmentNames = new Map(equipments.rows.map(({ record }) => [value(record, "Equip_ID", "Equipment_ID", "EquipId", "ID"), value(record, "Equip_Name", "Equipment_Name", "EquipName", "Name")]));
    const evidenceImage = String(input.evidenceImage || "");
    if (evidenceImage && (!evidenceImage.startsWith("data:image/jpeg;base64,") || evidenceImage.length > 45_000)) {
      throw new InventoryActionError("รูปหลักฐานการคืนไม่ถูกต้องหรือมีขนาดใหญ่เกินไป");
    }
    const requests = input.items?.length ? input.items : input.transactionId ? [{ transactionId: input.transactionId, quantity: Number(input.quantity) }] : [];
    if (!requests.length) throw new InventoryActionError("กรุณาเลือกรายการที่ต้องการคืน");
    if (new Set(requests.map((item) => item.transactionId)).size !== requests.length) throw new InventoryActionError("พบรายการคืนซ้ำกัน");
    const updates: Update[] = [];
    const transactions = withColumns(transactionSource, ["Transaction_Type", "Parent_Tx_ID", "Original_Qty", "Outstanding_Qty", "Return_Group_ID", "Return_Date", "Return_User_ID", "Return_Evidence_Image"], updates);
    const selected = requests.map((request) => {
      const transaction = transactions.rows.find(({ record }) => value(record, "Tx_ID", "Transaction_ID", "TransactionId", "ID") === request.transactionId && value(record, "Transaction_Type").toLowerCase() !== "return");
      if (!transaction) throw new InventoryActionError("ไม่พบรายการที่กำลังยืม");
      if (!["borrowed", "overdue"].includes(value(transaction.record, "Status").toLowerCase())) throw new InventoryActionError("มีรายการที่ถูกคืนหรือดำเนินการแล้ว");
      const ownerCompanyId = value(transaction.record, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = value(transaction.record, "Borrower_Company_ID", "BorrowerCompanyId");
      if (borrowerCompanyId !== user.companyId) throw new InventoryActionError("หน่วยของคุณไม่มีสิทธิ์คืนรายการนี้");
      const sourceInventoryId = value(transaction.record, "Inv_ID", "Inventory_ID", "InventoryId");
      const destinationInventoryId = value(transaction.record, "Destination_Inventory_ID", "Borrower_Inventory_ID");
      const transactionPlateNumber = value(transaction.record, "Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial");
      const directEquipmentId = value(transaction.record, "Equip_ID", "Equipment_ID", "EquipId");
      const sourceInventory = inventories.rows.find((row) => sourceInventoryId && inventoryKey(row) === sourceInventoryId && (!transactionPlateNumber || value(row.record, "Plate_Number", "PlateNumber") === transactionPlateNumber)) || inventories.rows.find((row) => directEquipmentId && value(row.record, "Company_ID", "CompanyId") === ownerCompanyId && value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === directEquipmentId && (!transactionPlateNumber || value(row.record, "Plate_Number", "PlateNumber") === transactionPlateNumber)) || inferLegacySourceInventory(transaction, inventories.rows);
      const equipmentId = directEquipmentId || value(sourceInventory?.record ?? {}, "Equip_ID", "Equipment_ID", "EquipId");
      const plateNumber = transactionPlateNumber || value(sourceInventory?.record ?? {}, "Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial");
      const destinationInventory = inventories.rows.find((row) =>
        destinationInventoryId && inventoryKey(row) === destinationInventoryId && (!plateNumber || value(row.record, "Plate_Number", "PlateNumber") === plateNumber),
      ) || (!destinationInventoryId ? inventories.rows.find((row) =>
        value(row.record, "Company_ID", "CompanyId") === borrowerCompanyId &&
        value(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId &&
        (!plateNumber || value(row.record, "Plate_Number", "PlateNumber") === plateNumber),
      ) : undefined);
      if (!sourceInventory || !destinationInventory) throw new InventoryActionError("ไม่พบคลังต้นทางหรือปลายทาง");
      const originalQuantity = numberValue(transaction.record, "Original_Qty") || numberValue(transaction.record, "Qty", "Quantity");
      const outstandingQuantity = numberValue(transaction.record, "Outstanding_Qty") || numberValue(transaction.record, "Qty", "Quantity");
      const quantity = Math.floor(Number(request.quantity));
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > outstandingQuantity) throw new InventoryActionError(`คืน ${request.transactionId} ได้สูงสุด ${outstandingQuantity} รายการ`);
      return { transaction, ownerCompanyId, borrowerCompanyId, sourceInventory, destinationInventory, equipmentId, plateNumber, originalQuantity, outstandingQuantity, quantity, selfUse: ownerCompanyId === borrowerCompanyId && sourceInventory.rowNumber === destinationInventory.rowNumber };
    });
    if (new Set(selected.map((item) => item.ownerCompanyId)).size !== 1) throw new InventoryActionError("รายการที่คืนพร้อมกันต้องมาจากกองร้อยเจ้าของเดียวกัน");
    const changes = new Map<number, { row: Table["rows"][number]; total: number; available: number; borrowed: number }>();
    const change = (row: Table["rows"][number], total: number, available: number, borrowed: number) => { const current = changes.get(row.rowNumber) || { row, total: 0, available: 0, borrowed: 0 }; current.total += total; current.available += available; current.borrowed += borrowed; changes.set(row.rowNumber, current); };
    selected.forEach((item) => { change(item.sourceInventory, item.selfUse ? 0 : item.quantity, item.quantity, -item.quantity); if (!item.selfUse) change(item.destinationInventory, -item.quantity, -item.quantity, 0); });
    for (const item of changes.values()) {
      const total = numberValue(item.row.record, "Qty_Total", "Total_Quantity") + item.total;
      const available = numberValue(item.row.record, "Qty_Available", "Available_Quantity") + item.available;
      const borrowed = numberValue(item.row.record, "Qty_Borrowed", "Borrowed_Quantity") + item.borrowed;
      if (total < 0 || available < 0 || borrowed < 0) throw new InventoryActionError("ยอดคลังไม่เพียงพอสำหรับรายการคืนที่เลือก");
      updates.push(cell(inventories, item.row.rowNumber, column(inventories.headers, "Qty_Total", "Total_Quantity"), total), cell(inventories, item.row.rowNumber, column(inventories.headers, "Qty_Available", "Available_Quantity"), available), cell(inventories, item.row.rowNumber, column(inventories.headers, "Qty_Borrowed", "Borrowed_Quantity"), borrowed));
    }
    const now = new Date().toISOString();
    const returnGroupId = `RET-${crypto.randomUUID()}`;
    let returnRowNumber = nextRow(transactions);
    selected.forEach((item, index) => {
      const remaining = item.outstandingQuantity - item.quantity;
      updates.push(
        cell(transactions, item.transaction.rowNumber, column(transactions.headers, "Transaction_Type"), "BORROW"),
        cell(transactions, item.transaction.rowNumber, column(transactions.headers, "Original_Qty"), item.originalQuantity),
        cell(transactions, item.transaction.rowNumber, column(transactions.headers, "Outstanding_Qty"), remaining),
        cell(transactions, item.transaction.rowNumber, column(transactions.headers, "Status"), remaining === 0 ? "Returned" : "Borrowed"),
      );
      const returnId = `${returnGroupId}-${index + 1}`;
      const row = rowValues(transactions.headers, [
        { aliases: ["Tx_ID", "Transaction_ID", "ID"], value: returnId }, { aliases: ["Group_Tx_ID", "Borrow_Batch_ID"], value: returnGroupId }, { aliases: ["Return_Group_ID"], value: returnGroupId }, { aliases: ["Transaction_Type"], value: "RETURN" }, { aliases: ["Parent_Tx_ID"], value: value(item.transaction.record, "Tx_ID") },
        { aliases: ["Owner_Company_ID"], value: item.ownerCompanyId }, { aliases: ["Borrower_Company_ID"], value: item.borrowerCompanyId }, { aliases: ["User_ID"], value: user.userId }, { aliases: ["Inv_ID"], value: value(item.transaction.record, "Inv_ID") }, { aliases: ["Destination_Inventory_ID", "Borrower_Inventory_ID"], value: value(item.transaction.record, "Destination_Inventory_ID", "Borrower_Inventory_ID") }, { aliases: ["Equip_ID"], value: item.equipmentId }, { aliases: ["Plate_Number"], value: item.plateNumber },
        { aliases: ["Qty", "Quantity"], value: item.quantity }, { aliases: ["Original_Qty"], value: item.quantity }, { aliases: ["Outstanding_Qty"], value: 0 }, { aliases: ["Borrow_Date", "Transaction_Date", "Date"], value: now }, { aliases: ["Return_Date"], value: now }, { aliases: ["Return_User_ID"], value: user.userId }, { aliases: ["Status"], value: "Returned" }, { aliases: ["Note", "Remarks"], value: `คืนยุทโธปกรณ์จากรายการ ${value(item.transaction.record, "Tx_ID")}` }, { aliases: ["Evidence_Image", "Return_Evidence_Image"], value: evidenceImage },
      ]);
      updates.push({ range: `'${transactions.name}'!A${returnRowNumber}:${letter(transactions.headers.length - 1)}${returnRowNumber}`, values: [row] });
      returnRowNumber += 1;
    });
    updates.push(append(audits, rowValues(audits.headers, [
      { aliases: ["Log_ID", "Audit_ID", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "RETURN" },
      { aliases: ["Table_Name", "Target_Table"], value: "Transactions" },
      { aliases: ["Target_ID", "Record_ID", "Tx_ID"], value: returnGroupId },
      { aliases: ["Details", "Description"], value: `Returned ${selected.length} transaction item(s)` },
    ])));
    await write(updates);
    return {
      result: { success: true, returnGroupId },
      notification: {
        kind: "return" as const,
        actorName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        ownerCompanyId: selected[0].ownerCompanyId,
        ownerCompanyName: companyNames.get(selected[0].ownerCompanyId) || selected[0].ownerCompanyId,
        borrowerCompanyId: selected[0].borrowerCompanyId,
        borrowerCompanyName: companyNames.get(selected[0].borrowerCompanyId) || selected[0].borrowerCompanyId,
        referenceId: returnGroupId,
        occurredAt: now,
        items: selected.map((item) => ({ name: equipmentNames.get(item.equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์", quantity: item.quantity, plateNumber: item.plateNumber })),
      },
    };
  });
  await sendLineActivityNotification(outcome.notification);
  return outcome.result;
}

export async function reportDefect(
  user: SessionUser,
  input: { sourceType: "inventory" | "borrowed"; sourceId: string; quantity: number; note?: string; evidenceImage?: string },
) {
  const outcome = await withSheetsMutationLock(async () => {
    if (input.sourceType !== "inventory") throw new InventoryActionError("แจ้งซ่อมได้เฉพาะยุทโธปกรณ์ที่เป็นของกองร้อยตนเอง");
    const [inventories, transactions, maintenanceSource, audits, companies, equipments] = await Promise.all([
      readTable("Inventories"), readTable("Transactions"), readTable("Maintenance"), readTable("Audit_Log"), readTable("Companies"), readEquipmentTable(),
    ]);
    const companyNames = new Map(companies.rows.map(({ record }) => [value(record, "Company_ID", "CompanyId", "ID"), value(record, "Company_Name", "CompanyName", "Name")]));
    const equipmentNames = new Map(equipments.rows.map(({ record }) => [value(record, "Equip_ID", "Equipment_ID", "EquipId", "ID"), value(record, "Equip_Name", "Equipment_Name", "EquipName", "Name")]));
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
    const companyId = value(inventory.record, "Company_ID", "CompanyId");
    return {
      result: { success: true },
      notification: {
        kind: "defect" as const,
        actorName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        ownerCompanyId: companyId,
        ownerCompanyName: companyNames.get(companyId) || companyId,
        referenceId: maintenanceId,
        occurredAt: now,
        note: input.note?.trim() || "",
        items: [{ name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์", quantity, plateNumber: value(inventory.record, "Plate_Number", "PlateNumber") }],
      },
    };
  });
  await sendLineActivityNotification(outcome.notification);
  return outcome.result;
}
