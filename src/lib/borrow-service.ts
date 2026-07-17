import "server-only";

import { google } from "googleapis";
import { getAccountById } from "@/lib/account-service";
import type { SessionUser } from "@/lib/auth-session";
import { sendLineActivityNotification } from "@/lib/line-oa-notification";
import { withSheetsMutationLock } from "@/lib/sheets-mutation-lock";

type SheetRecord = Record<string, string>;

type SheetRow = {
  record: SheetRecord;
  rowNumber: number;
};

type SheetTable = {
  name: string;
  headers: string[];
  rows: SheetRow[];
};

export type BorrowInventoryItem = {
  selectionId: string;
  inventoryId: string;
  equipmentId: string;
  name: string;
  category: string;
  available: number;
  inboundBorrowed: number;
  requirePlate: boolean;
  plateNumber: string;
};

export type BorrowCompany = {
  id: string;
  name: string;
};

export type BorrowPageData = {
  ownerCompanyId: string;
  ownerCompanyName: string;
  borrowerName: string;
  contactPhone: string;
  contactEmail: string;
  inventory: BorrowInventoryItem[];
  companies: BorrowCompany[];
};

export type CategoryInventoryItem = BorrowInventoryItem & {
  total: number;
  broken: number;
};

export type CategoryInventoryData = {
  category: string;
  ownerCompanyId: string;
  companyName: string;
  borrowerName: string;
  contactPhone: string;
  contactEmail: string;
  inventory: CategoryInventoryItem[];
  companies: BorrowCompany[];
};

export type BorrowRequestInput = {
  borrowerCompanyId: string;
  dueDate?: string;
  note?: string;
  evidenceName?: string;
  evidenceImage?: string;
  items: Array<{ inventoryId: string; quantity: number; plateNumber?: string }>;
};

export type BorrowReceipt = {
  txId: string;
  date: string;
  borrowerName: string;
  contactPhone: string;
  contactEmail: string;
  borrowerCompanyName: string;
  ownerCompanyName: string;
  dueDate: string;
  note: string;
  evidenceImage: string;
  items: Array<{ name: string; quantity: number; plateNumber: string }>;
};

export class BorrowValidationError extends Error {}

function getGoogleConfiguration() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Google Sheets environment variables are not configured.");
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("GOOGLE_PRIVATE_KEY is not a valid PEM private key.");
  }

  return { clientEmail, privateKey, spreadsheetId };
}

async function getSheetsClient() {
  const { clientEmail, privateKey } = getGoogleConfiguration();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function getSheetTable(sheetName: string): Promise<SheetTable> {
  const { spreadsheetId } = getGoogleConfiguration();
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:ZZ`,
  });
  const [rawHeaders = [], ...values] = response.data.values ?? [];
  const headers = rawHeaders.map((header) => String(header).trim());
  const rows = values
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell !== "" && cell !== undefined))
    .map(({ row, rowNumber }) => ({
      rowNumber,
      record: headers.reduce<SheetRecord>((record, header, index) => {
        if (header) {
          record[header] = String(row[index] ?? "").trim();
        }
        return record;
      }, {}),
    }));

  return { name: sheetName, headers, rows };
}

async function getEquipmentTable() {
  const equipmentTable = await getSheetTable("Equipments");
  return equipmentTable.rows.length ? equipmentTable : getSheetTable("Master_Equipments");
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

function getField(record: SheetRecord, ...fieldNames: string[]) {
  const key = Object.keys(record).find((candidate) =>
    fieldNames.some((fieldName) => normalizedKey(candidate) === normalizedKey(fieldName)),
  );
  return key ? record[key] : "";
}

function getNumber(record: SheetRecord, ...fieldNames: string[]) {
  const value = Number(getField(record, ...fieldNames).replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function getBoolean(record: SheetRecord, ...fieldNames: string[]) {
  return ["true", "1", "yes", "y"].includes(getField(record, ...fieldNames).toLowerCase());
}

function getInventoryKey(row: SheetRow) {
  return getField(row.record, "Inv_ID", "Inventory_ID", "InventoryId", "ID") || `row-${row.rowNumber}`;
}

function getPlateOrSerial(record: SheetRecord) {
  return getField(record, "Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial");
}

function getInventorySelectionKey(row: SheetRow, requirePlate: boolean) {
  const inventoryId = getInventoryKey(row);
  if (!requirePlate) return inventoryId;
  const plateNumber = getPlateOrSerial(row.record) || "no-plate";
  return `${inventoryId}::${plateNumber}::row-${row.rowNumber}`;
}

function inboundBorrowedByInventory(transactions: SheetTable, inventories: SheetRow[], companyId: string) {
  const inbound = new Map<string, number>();
  transactions.rows.forEach(({ record }) => {
    if (getField(record, "Transaction_Type").toLowerCase() === "return") return;
    if (!["borrowed", "overdue"].includes(getField(record, "Status").toLowerCase())) return;
    const ownerCompanyId = getField(record, "Owner_Company_ID", "OwnerCompanyId");
    const borrowerCompanyId = getField(record, "Borrower_Company_ID", "BorrowerCompanyId");
    if (borrowerCompanyId !== companyId || ownerCompanyId === borrowerCompanyId) return;
    const equipmentId = getField(record, "Equip_ID", "Equipment_ID", "EquipId");
    const plateNumber = getPlateOrSerial(record);
    const recordedDestinationId = getField(record, "Destination_Inventory_ID", "Borrower_Inventory_ID");
    const destination = inventories.find((row) => recordedDestinationId && getInventoryKey(row) === recordedDestinationId && getField(row.record, "Company_ID", "CompanyId") === borrowerCompanyId && (!equipmentId || getField(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId) && (!plateNumber || getPlateOrSerial(row.record) === plateNumber))
      || inventories.find((row) => getField(row.record, "Company_ID", "CompanyId") === borrowerCompanyId && getField(row.record, "Equip_ID", "Equipment_ID", "EquipId") === equipmentId && (!plateNumber || getPlateOrSerial(row.record) === plateNumber));
    if (!destination) return;
    const destinationId = getInventoryKey(destination);
    const quantity = getNumber(record, "Outstanding_Qty") || getNumber(record, "Qty", "Quantity");
    inbound.set(destinationId, (inbound.get(destinationId) || 0) + quantity);
  });
  return inbound;
}

function getHeaderIndex(headers: string[], ...fieldNames: string[]) {
  return headers.findIndex((header) =>
    fieldNames.some((fieldName) => normalizedKey(header) === normalizedKey(fieldName)),
  );
}

function columnLetter(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

type RowField = { aliases: string[]; value: string | number };

function buildRow(headers: string[], fields: RowField[]) {
  return headers.map((header) => {
    const field = fields.find(({ aliases }) =>
      aliases.some((alias) => normalizedKey(alias) === normalizedKey(header)),
    );
    return field?.value ?? "";
  });
}

function nextRowNumber(table: SheetTable) {
  return Math.max(1, ...table.rows.map((row) => row.rowNumber)) + 1;
}

function createTxId() {
  const date = new Date();
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().split("-")[0].toUpperCase();
  return `TX-${day}-${random}`;
}

export async function getBorrowPageData(user: SessionUser): Promise<BorrowPageData> {
  const [companiesTable, equipmentTable, inventoriesTable, transactionsTable, account] = await Promise.all([
    getSheetTable("Companies"),
    getEquipmentTable(),
    getSheetTable("Inventories"),
    getSheetTable("Transactions"),
    getAccountById(user.userId),
  ]);
  const equipmentById = new Map(
    equipmentTable.rows.map(({ record }) => [
      getField(record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId", "ID"),
      record,
    ]),
  );
  const inbound = inboundBorrowedByInventory(transactionsTable, inventoriesTable.rows, user.companyId);
  const companies = companiesTable.rows
    .map(({ record }) => ({
      id: getField(record, "Company_ID", "CompanyId", "ID"),
      name: getField(record, "Company_Name", "CompanyName", "Name"),
    }))
    .filter((company, index) => company.id && company.name && !["false", "0", "deleted", "inactive"].includes(getField(companiesTable.rows[index]?.record || {}, "Is_Active", "Active", "Status").toLowerCase()));
  const inventory = inventoriesTable.rows
    .filter(({ record }) => getField(record, "Company_ID", "CompanyId") === user.companyId)
    .map((row) => {
      const equipmentId = getField(row.record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId");
      const equipment = equipmentById.get(equipmentId) ?? {};
      const requirePlate = getBoolean(equipment, "Require_Plate", "RequirePlate");

      const inboundBorrowed = inbound.get(getInventoryKey(row)) || 0;
      return {
        selectionId: getInventorySelectionKey(row, requirePlate),
        inventoryId: getInventoryKey(row),
        equipmentId,
        name: getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name") || "ไม่ระบุชื่อ",
        category: getField(equipment, "Category", "Category_Name", "Equip_Category") || "อื่น ๆ",
        available: Math.max(0, getNumber(row.record, "Qty_Available", "Available_Quantity", "QtyAvailable") - inboundBorrowed),
        inboundBorrowed,
        requirePlate,
        plateNumber: getPlateOrSerial(row.record),
      };
    })
    .filter((item) => item.available > 0)
    .sort((first, second) => first.name.localeCompare(second.name, "th"));

  return {
    ownerCompanyId: user.companyId,
    ownerCompanyName: companies.find((company) => company.id === user.companyId)?.name || "หน่วยงานของคุณ",
    borrowerName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    contactPhone: account?.phone || "",
    contactEmail: account?.gmail || account?.email || user.email,
    companies,
    inventory,
  };
}

export async function getCategoryInventoryData(
  user: SessionUser,
  categoryName: string,
): Promise<CategoryInventoryData> {
  const [companiesTable, equipmentTable, inventoriesTable, transactionsTable, account] = await Promise.all([
    getSheetTable("Companies"),
    getEquipmentTable(),
    getSheetTable("Inventories"),
    getSheetTable("Transactions"),
    getAccountById(user.userId),
  ]);
  const companies = companiesTable.rows
    .map(({ record }) => ({
      id: getField(record, "Company_ID", "CompanyId", "ID"),
      name: getField(record, "Company_Name", "CompanyName", "Name"),
    }))
    .filter((company, index) => company.id && company.name && !["false", "0", "deleted", "inactive"].includes(getField(companiesTable.rows[index]?.record || {}, "Is_Active", "Active", "Status").toLowerCase()));
  const companyInventoryRows = inventoriesTable.rows.filter(
    ({ record }) => getField(record, "Company_ID", "CompanyId") === user.companyId,
  );
  const inbound = inboundBorrowedByInventory(transactionsTable, inventoriesTable.rows, user.companyId);
  const inventory = equipmentTable.rows
    .filter(({ record }) =>
      normalizedKey(getField(record, "Category", "Category_Name", "Equip_Category")) === normalizedKey(categoryName) &&
      !["false", "0", "deleted", "inactive"].includes(getField(record, "Is_Active", "Active", "Status").toLowerCase()),
    )
    .flatMap(({ record: equipment }) => {
      const equipmentId = getField(equipment, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId", "ID");
      const matchingRows = companyInventoryRows.filter(
        ({ record }) => getField(record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId") === equipmentId,
      );
      const rows = matchingRows.length ? matchingRows : [null];

      return rows.map((row) => ({
        selectionId: row
          ? getInventorySelectionKey(row, getBoolean(equipment, "Require_Plate", "RequirePlate"))
          : `missing:${equipmentId}`,
        inventoryId: row ? getInventoryKey(row) : `missing:${equipmentId}`,
        equipmentId,
        name: getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name") || "ไม่ระบุชื่อ",
        category: getField(equipment, "Category", "Category_Name", "Equip_Category") || "อื่น ๆ",
        available: row ? Math.max(0, getNumber(row.record, "Qty_Available", "Available_Quantity", "QtyAvailable") - (inbound.get(getInventoryKey(row)) || 0)) : 0,
        inboundBorrowed: row ? inbound.get(getInventoryKey(row)) || 0 : 0,
        total: row ? getNumber(row.record, "Qty_Total", "Total_Quantity", "QtyTotal") : 0,
        broken: row ? getNumber(row.record, "Qty_Broken", "Broken_Quantity", "QtyBroken") : 0,
        requirePlate: getBoolean(equipment, "Require_Plate", "RequirePlate"),
        plateNumber: row ? getPlateOrSerial(row.record) : "",
      }));
    })
    .sort((first, second) => first.name.localeCompare(second.name, "th"));

  return {
    category: categoryName,
    ownerCompanyId: user.companyId,
    companyName: companies.find((company) => company.id === user.companyId)?.name || "หน่วยงานของคุณ",
    borrowerName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    contactPhone: account?.phone || "",
    contactEmail: account?.gmail || account?.email || user.email,
    companies,
    inventory,
  };
}

export async function submitBorrowRequest(user: SessionUser, input: BorrowRequestInput): Promise<BorrowReceipt> {
  const receipt = await withSheetsMutationLock(async () => {
    if (!input.borrowerCompanyId || !input.items.length) {
      throw new BorrowValidationError("กรุณากรอกข้อมูลการยืมให้ครบถ้วน");
    }
    const uniqueSelections = new Set(input.items.map((item) => `${item.inventoryId}::${item.plateNumber || ""}`));
    if (uniqueSelections.size !== input.items.length) throw new BorrowValidationError("พบรายการยุทโธปกรณ์ซ้ำ กรุณาเลือกแต่ละรายการเพียงครั้งเดียว");

    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
      throw new BorrowValidationError("วันและเวลาส่งคืนต้องอยู่ในอนาคต");
    }

    if (new Set(input.items.map((item) => `${item.inventoryId}::${item.plateNumber || ""}`)).size !== input.items.length) {
      throw new BorrowValidationError("พบรายการยุทโธปกรณ์ซ้ำกัน");
    }
    if (input.evidenceImage && (!input.evidenceImage.startsWith("data:image/jpeg;base64,") || input.evidenceImage.length > 45_000)) {
      throw new BorrowValidationError("รูปหลักฐานไม่ถูกต้องหรือมีขนาดใหญ่เกินไป");
    }

    const [companiesTable, equipmentTable, inventoriesTable, transactionsTable, auditTable, account] = await Promise.all([
      getSheetTable("Companies"),
      getEquipmentTable(),
      getSheetTable("Inventories"),
      getSheetTable("Transactions"),
      getSheetTable("Audit_Log"),
      getAccountById(user.userId),
    ]);
    const borrowerCompany = companiesTable.rows.find(
      ({ record }) => getField(record, "Company_ID", "CompanyId", "ID") === input.borrowerCompanyId,
    );
    if (!borrowerCompany) {
      throw new BorrowValidationError("ไม่พบหน่วยงานผู้ยืมที่เลือก");
    }
    const selfUse = input.borrowerCompanyId === user.companyId;
    if (selfUse && !input.note?.trim()) throw new BorrowValidationError("การเบิกใช้งานภายในหน่วยต้องระบุสถานที่และวัตถุประสงค์ในหมายเหตุ");

    const companyNameById = new Map(
      companiesTable.rows.map(({ record }) => [
        getField(record, "Company_ID", "CompanyId", "ID"),
        getField(record, "Company_Name", "CompanyName", "Name"),
      ]),
    );
    const inbound = inboundBorrowedByInventory(transactionsTable, inventoriesTable.rows, user.companyId);
    const equipmentById = new Map(
      equipmentTable.rows.map(({ record }) => [
        getField(record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId", "ID"),
        record,
      ]),
    );
    const requestedRows = input.items.map((requestItem) => {
      const inventoryRow = inventoriesTable.rows.find((row) =>
        getInventoryKey(row) === requestItem.inventoryId &&
        (!requestItem.plateNumber || getPlateOrSerial(row.record) === requestItem.plateNumber),
      );

      if (!inventoryRow || getField(inventoryRow.record, "Company_ID", "CompanyId") !== user.companyId) {
        throw new BorrowValidationError("ไม่พบยุทโธปกรณ์ที่เลือกในคลังของคุณ");
      }

      const equipmentId = getField(inventoryRow.record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId");
      const equipment = equipmentById.get(equipmentId) ?? {};
      const physicalAvailable = getNumber(inventoryRow.record, "Qty_Available", "Available_Quantity", "QtyAvailable");
      const inboundQuantity = inbound.get(getInventoryKey(inventoryRow)) || 0;
      const available = Math.max(0, physicalAvailable - inboundQuantity);
      const borrowed = getNumber(inventoryRow.record, "Qty_Borrowed", "Borrowed_Quantity", "QtyBorrowed");
      const total = getNumber(inventoryRow.record, "Qty_Total", "Total_Quantity", "QtyTotal");
      const requirePlate = getBoolean(equipment, "Require_Plate", "RequirePlate");
      const quantity = requirePlate ? 1 : Math.floor(Number(requestItem.quantity));
      const plateNumber = getPlateOrSerial(inventoryRow.record);
      if (!selfUse && inboundQuantity > 0) {
        throw new BorrowValidationError(`${getField(equipment, "Equip_Name", "Equipment_Name", "Name") || "รายการที่เลือก"}${plateNumber ? ` (${plateNumber})` : ""} เป็นยุทโธปกรณ์ที่กองร้อยรับยืมมา จึงห้ามเบิกส่งต่อให้กองร้อยอื่นโดยเด็ดขาด`);
      }
      if (requirePlate && (!requestItem.plateNumber || requestItem.plateNumber !== plateNumber)) {
        throw new BorrowValidationError("กรุณาเลือกยานพาหนะตามหมายเลขทะเบียนที่แสดง");
      }
      const destinationInventory = selfUse ? inventoryRow : inventoriesTable.rows.find(({ record }) =>
        getField(record, "Company_ID", "CompanyId") === input.borrowerCompanyId &&
        getField(record, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId") === equipmentId &&
        (!plateNumber || getPlateOrSerial(record) === plateNumber),
      );

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
        throw new BorrowValidationError(
          `${getField(equipment, "Equip_Name", "Equipment_Name", "Name") || "รายการที่เลือก"} มีจำนวนคงเหลือไม่เพียงพอ`,
        );
      }

      return {
        inventoryRow,
        equipmentId,
        name: getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name") || "ไม่ระบุชื่อ",
        plateNumber,
        available,
        physicalAvailable,
        borrowed,
        total,
        quantity,
        destinationInventory,
        destinationInventoryId: selfUse ? getInventoryKey(inventoryRow) : destinationInventory
          ? getInventoryKey(destinationInventory)
          : `INV-${crypto.randomUUID()}`,
        destinationAvailable: destinationInventory
          ? getNumber(destinationInventory.record, "Qty_Available", "Available_Quantity", "QtyAvailable")
          : 0,
        destinationTotal: destinationInventory
          ? getNumber(destinationInventory.record, "Qty_Total", "Total_Quantity", "QtyTotal")
          : 0,
      };
    });

    const availableColumn = getHeaderIndex(
      inventoriesTable.headers,
      "Qty_Available",
      "Available_Quantity",
      "QtyAvailable",
    );
    const borrowedColumn = getHeaderIndex(
      inventoriesTable.headers,
      "Qty_Borrowed",
      "Borrowed_Quantity",
      "QtyBorrowed",
    );
    const totalColumn = getHeaderIndex(inventoriesTable.headers, "Qty_Total", "Total_Quantity", "QtyTotal");
    if (availableColumn < 0 || borrowedColumn < 0 || totalColumn < 0) {
      throw new Error("Inventories sheet must contain Qty_Total, Qty_Available and Qty_Borrowed columns.");
    }
    if (!transactionsTable.headers.length || !auditTable.headers.length) {
      throw new Error("Transactions and Audit_Log sheets must contain a header row.");
    }

    const now = new Date();
    const txId = createTxId();
    const transactionStartRow = nextRowNumber(transactionsTable);
    const auditRowNumber = nextRowNumber(auditTable);
    const transactionRows = requestedRows.map((item, index) =>
      buildRow(transactionsTable.headers, [
        { aliases: ["Tx_ID", "Transaction_ID", "TransactionId", "ID"], value: `${txId}-${index + 1}` },
        { aliases: ["Group_Tx_ID", "Borrow_Batch_ID"], value: txId },
        { aliases: ["Owner_Company_ID", "OwnerCompanyId"], value: user.companyId },
        { aliases: ["Borrower_Company_ID", "BorrowerCompanyId"], value: input.borrowerCompanyId },
        { aliases: ["User_ID", "UserId"], value: user.userId },
        { aliases: ["Inv_ID", "Inventory_ID", "InventoryId"], value: getInventoryKey(item.inventoryRow) },
        { aliases: ["Destination_Inventory_ID", "Borrower_Inventory_ID"], value: item.destinationInventoryId },
        { aliases: ["Equip_ID", "Equipment_ID", "EquipId", "EquipmentId"], value: item.equipmentId },
        { aliases: ["Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial"], value: item.plateNumber },
        { aliases: ["Qty", "Quantity"], value: item.quantity },
        { aliases: ["Original_Qty"], value: item.quantity },
        { aliases: ["Outstanding_Qty"], value: item.quantity },
        { aliases: ["Transaction_Type"], value: "BORROW" },
        { aliases: ["Borrow_Date", "Transaction_Date", "Date"], value: now.toISOString() },
        { aliases: ["Due_Date", "DueDate"], value: dueDate.toISOString() },
        { aliases: ["Status"], value: "Borrowed" },
        { aliases: ["Note", "Remarks"], value: input.note?.trim() || "" },
        { aliases: ["Evidence_Image", "Evidence", "Evidence_File"], value: input.evidenceImage || input.evidenceName || "" },
      ]),
    );
    const auditRow = buildRow(auditTable.headers, [
      { aliases: ["Log_ID", "Audit_ID", "AuditId", "ID"], value: `AUD-${crypto.randomUUID()}` },
      { aliases: ["Timestamp", "Created_At", "Date"], value: now.toISOString() },
      { aliases: ["User_ID", "UserId"], value: user.userId },
      { aliases: ["Action_Type", "Action"], value: "BORROW" },
      { aliases: ["Table_Name", "Target_Table"], value: "Transactions" },
      { aliases: ["Target_ID", "Record_ID", "Tx_ID", "Transaction_ID"], value: txId },
      {
        aliases: ["Details", "Description", "Note"],
        value: `Borrowed ${requestedRows.length} item(s) for company ${input.borrowerCompanyId}`,
      },
    ]);
    let nextInventoryRow = nextRowNumber(inventoriesTable);
    const updates: Array<{ range: string; values: Array<Array<string | number>> }> = requestedRows.flatMap((item) => {
      const itemUpdates: Array<{ range: string; values: Array<Array<string | number>> }> = [
        {
          range: `'Inventories'!${columnLetter(availableColumn)}${item.inventoryRow.rowNumber}`,
          values: [[item.physicalAvailable - item.quantity]],
        },
        {
          range: `'Inventories'!${columnLetter(borrowedColumn)}${item.inventoryRow.rowNumber}`,
          values: [[item.borrowed + item.quantity]],
        },
      ];

      if (!selfUse) itemUpdates.unshift({
        range: `'Inventories'!${columnLetter(totalColumn)}${item.inventoryRow.rowNumber}`,
        values: [[Math.max(0, item.total - item.quantity)]],
      });

      if (!selfUse && item.destinationInventory) {
        itemUpdates.push(
          {
            range: `'Inventories'!${columnLetter(totalColumn)}${item.destinationInventory.rowNumber}`,
            values: [[item.destinationTotal + item.quantity]],
          },
          {
            range: `'Inventories'!${columnLetter(availableColumn)}${item.destinationInventory.rowNumber}`,
            values: [[item.destinationAvailable + item.quantity]],
          },
        );
      } else if (!selfUse) {
        const rowNumber = nextInventoryRow++;
        itemUpdates.push({
          range: `'Inventories'!A${rowNumber}:${columnLetter(inventoriesTable.headers.length - 1)}${rowNumber}`,
          values: [buildRow(inventoriesTable.headers, [
            { aliases: ["Inv_ID", "Inventory_ID", "InventoryId", "ID"], value: item.destinationInventoryId },
            { aliases: ["Company_ID", "CompanyId"], value: input.borrowerCompanyId },
            { aliases: ["Company_Name", "CompanyName"], value: companyNameById.get(input.borrowerCompanyId) || "" },
            { aliases: ["Equip_ID", "Equipment_ID", "EquipId", "EquipmentId"], value: item.equipmentId },
            { aliases: ["Plate_Number", "PlateNumber", "Serial_Number", "SerialNumber", "Weapon_Serial"], value: item.plateNumber },
            { aliases: ["Qty_Total", "Total_Quantity", "QtyTotal"], value: item.quantity },
            { aliases: ["Qty_Available", "Available_Quantity", "QtyAvailable"], value: item.quantity },
            { aliases: ["Qty_Borrowed", "Borrowed_Quantity", "QtyBorrowed"], value: 0 },
            { aliases: ["Qty_Broken", "Broken_Quantity", "QtyBroken"], value: 0 },
          ])],
        });
      }

      return itemUpdates;
    });
    updates.push(
      {
        range: `'Transactions'!A${transactionStartRow}:${columnLetter(transactionsTable.headers.length - 1)}${
          transactionStartRow + transactionRows.length - 1
        }`,
        values: transactionRows,
      },
      {
        range: `'Audit_Log'!A${auditRowNumber}:${columnLetter(auditTable.headers.length - 1)}${auditRowNumber}`,
        values: [auditRow],
      },
    );

    const { spreadsheetId } = getGoogleConfiguration();
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });

    return {
      txId,
      date: now.toISOString(),
      borrowerName: [user.rank, user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      contactPhone: account?.phone || "",
      contactEmail: account?.gmail || account?.email || user.email,
      borrowerCompanyName:
        getField(borrowerCompany.record, "Company_Name", "CompanyName", "Name") || input.borrowerCompanyId,
      ownerCompanyName: companyNameById.get(user.companyId) || user.companyId,
      dueDate: dueDate.toISOString(),
      note: input.note?.trim() || "-",
      evidenceImage: input.evidenceImage || "",
      items: requestedRows.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        plateNumber: item.plateNumber,
      })),
    };
  });
  await sendLineActivityNotification({
    kind: "borrow",
    actorName: receipt.borrowerName,
    ownerCompanyId: user.companyId,
    ownerCompanyName: receipt.ownerCompanyName,
    borrowerCompanyId: input.borrowerCompanyId,
    borrowerCompanyName: receipt.borrowerCompanyName,
    referenceId: receipt.txId,
    occurredAt: receipt.date,
    dueDate: receipt.dueDate,
    note: receipt.note,
    items: receipt.items,
  });
  return receipt;
}
