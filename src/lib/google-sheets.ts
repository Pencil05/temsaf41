import "server-only";

import { google } from "googleapis";
import { normalizeUserRole, type SessionUser } from "@/lib/auth-session";
import { migrateLegacyPassword } from "@/lib/account-service";
import { needsPasswordRehash, verifyPassword } from "@/lib/password-utils";

const mockUsers = [
  {
    userId: "admin-001",
    companyId: "company-001",
    email: "admin@wing41.com",
    role: "Admin" as const,
    rank: "Cmdr",
    firstName: "TEMS",
    lastName: "Administrator",
    password: "password123",
  },
  {
    userId: "user-001",
    companyId: "company-002",
    email: "user@wing41.com",
    role: "User" as const,
    rank: "Sgt",
    firstName: "Wing",
    lastName: "41 User",
    password: "password123",
  },
];

type SheetRecord = Record<string, string>;

type CachedValue<T> = { value: T; expiresAt: number };

const SHEET_ROWS_CACHE_TTL_MS = 0;
const sheetRowsCache = new Map<string, CachedValue<SheetRecord[]>>();
const pendingSheetRows = new Map<string, Promise<SheetRecord[]>>();

export type DashboardCategory = {
  name: string;
  quantity: number;
};

export type DashboardActivity = {
  id: string;
  message: string;
  date: string;
  isOverdue: boolean;
  kind: "borrow" | "return" | "defect" | "overdue";
  href: string;
};

export type GlobalSearchItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: "equipment" | "category";
};

export type UserDashboardData = {
  companyName: string;
  categories: DashboardCategory[];
  activities: DashboardActivity[];
};

export type UserHistoryItem = {
  id: string;
  transactionIds: string[];
  movementType: "borrow" | "return" | "defect";
  equipmentName: string;
  items: Array<{
    transactionId: string;
    name: string;
    quantity: number;
    plateNumber?: string;
  }>;
  borrowerName: string;
  contactPhone: string;
  contactEmail: string;
  quantity: number;
  ownerCompanyName: string;
  borrowerCompanyName: string;
  date: string;
  dueDate: string;
  status: string;
  note: string;
  evidenceImage: string;
};

function getGoogleConfiguration() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("Google Sheets environment variables are not configured.");
  }

  return { clientEmail, privateKey, spreadsheetId };
}

function looksLikePemPrivateKey(value: string) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) && /-----END [A-Z ]*PRIVATE KEY-----/.test(value);
}

async function getSheetsClient() {
  const { clientEmail, privateKey } = getGoogleConfiguration();

  if (!looksLikePemPrivateKey(privateKey)) {
    throw new Error("GOOGLE_PRIVATE_KEY is not a valid PEM private key.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

async function getSheetRows(sheetName: string): Promise<SheetRecord[]> {
  const cacheKey = `sheet:${sheetName}`;
  const cached = sheetRowsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = pendingSheetRows.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const { spreadsheetId } = getGoogleConfiguration();
      const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:ZZ`,
    });
      const [headers = [], ...values] = response.data.values ?? [];
      const rows = values
        .filter((row) => row.some((cell) => cell !== "" && cell !== undefined))
        .map((row) =>
          headers.reduce<SheetRecord>((record, header, index) => {
            const key = String(header).trim();

            if (key) {
              record[key] = String(row[index] ?? "").trim();
            }

            return record;
          }, {}),
        );

      sheetRowsCache.set(cacheKey, {
        value: rows,
        expiresAt: Date.now() + SHEET_ROWS_CACHE_TTL_MS,
      });

      return rows;
    } catch (error) {
      console.error("Google Sheets lookup failed", error);
      return [];
    } finally {
      pendingSheetRows.delete(cacheKey);
    }
  })();

  pendingSheetRows.set(cacheKey, promise);
  return promise;
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[\s_-]/g, "");
}

function getField(record: SheetRecord, ...fieldNames: string[]) {
  const matchingKey = Object.keys(record).find((key) =>
    fieldNames.some((fieldName) => normalizedKey(fieldName) === normalizedKey(key)),
  );

  return matchingKey ? record[matchingKey] : "";
}

function getNumber(record: SheetRecord, ...fieldNames: string[]) {
  const rawValue = getField(record, ...fieldNames).replace(/,/g, "");
  const value = Number(rawValue);

  return Number.isFinite(value) ? value : 0;
}

function inferEquipmentIdFromLegacyTransaction(
  transaction: SheetRecord,
  inventories: SheetRecord[],
) {
  const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
  const quantity = getNumber(transaction, "Qty", "Quantity");
  const candidates = inventories.filter((inventory) =>
    getField(inventory, "Company_ID", "CompanyId") === ownerCompanyId &&
    getNumber(inventory, "Qty_Borrowed", "Borrowed_Quantity") >= quantity,
  );

  return candidates.length === 1
    ? getField(candidates[0], "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId")
    : "";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "ไม่ระบุวันที่";
  }

  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
}

export async function authenticateUser(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const users = await getSheetRows("Users");
    let shouldRehashPassword = false;
    const user = users.find((record) => {
      const loginName = getField(record, "Email", "Username", "User_Name").toLowerCase();
      const storedPasswordHash = getField(record, "Password_Hash");
      const legacyPassword = getField(record, "Password");

      if (loginName !== normalizedEmail) {
        return false;
      }

      if (storedPasswordHash && verifyPassword(password, storedPasswordHash)) {
        shouldRehashPassword = needsPasswordRehash(storedPasswordHash);
        return true;
      }

      if (legacyPassword && verifyPassword(password, legacyPassword)) {
        shouldRehashPassword = true;
        return true;
      }

      return false;
    });

    if (user) {
      const userId = getField(user, "User_ID", "UserId", "ID");
      if (shouldRehashPassword) {
        try {
          await migrateLegacyPassword(userId, password);
          sheetRowsCache.delete("sheet:Users");
        } catch (migrationError) {
          console.error("Password hash migration failed", migrationError);
        }
      }
      return {
        userId,
        companyId: getField(user, "Company_ID", "CompanyId"),
        email: getField(user, "Email", "Username", "User_Name"),
        role: normalizeUserRole(getField(user, "Role", "User_Role")),
        rank: getField(user, "Rank"),
        firstName: getField(user, "First_Name", "FirstName"),
        lastName: getField(user, "Last_Name", "LastName"),
      };
    }
  } catch (error) {
    console.error("Google Sheets authentication failed", error);
  }

  if (process.env.NODE_ENV === "production" || process.env.ALLOW_MOCK_AUTH !== "true") return null;

  const mockUser = mockUsers.find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail && candidate.password === password,
  );

  if (!mockUser) {
    return null;
  }

  return {
    userId: mockUser.userId,
    companyId: mockUser.companyId,
    email: mockUser.email,
    role: mockUser.role,
    rank: mockUser.rank,
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
  };
}

export async function getUserDashboardData(user: SessionUser): Promise<UserDashboardData> {
  const [companies, rawEquipments, inventories, transactions, maintenance] = await Promise.all([
    getSheetRows("Companies"),
    getSheetRows("Equipments"),
    getSheetRows("Inventories"),
    getSheetRows("Transactions"),
    getSheetRows("Maintenance"),
  ]);
  const masterEquipments = rawEquipments.length ? rawEquipments : await getSheetRows("Master_Equipments");

  const companyNameById = new Map(
    companies.map((company) => [
      getField(company, "Company_ID", "CompanyId", "ID"),
      getField(company, "Company_Name", "CompanyName", "Name"),
    ]),
  );
  const equipmentById = new Map(
    masterEquipments.map((equipment) => [
      getField(equipment, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId", "ID"),
      {
        name: getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name"),
        category: getField(equipment, "Category", "Category_Name", "Equipment_Category", "Equip_Category") || "อื่น ๆ",
      },
    ]),
  );
  const equipmentIdByInventoryId = new Map(
    inventories.flatMap((inventory) => {
      const inventoryId = getField(inventory, "Inv_ID", "Inventory_ID", "InventoryId", "ID");
      return inventoryId ? [[
        inventoryId,
        getField(inventory, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId"),
      ] as const] : [];
    }),
  );
  const quantityByCategory = new Map<string, number>();
  const categoryNames = new Set<string>();

  masterEquipments.forEach((equipment) => {
    const category = getField(equipment, "Category", "Category_Name", "Equipment_Category", "Equip_Category").trim();
    if (category) {
      categoryNames.add(category);
    }
  });

  const companyInventories = inventories.filter(
    (inventory) => getField(inventory, "Company_ID", "CompanyId") === user.companyId,
  );

  companyInventories.forEach((inventory) => {
    const equipmentId = getField(inventory, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId");
    const category =
      equipmentById.get(equipmentId)?.category ||
      getField(inventory, "Category", "Category_Name", "Equipment_Category", "Equip_Category") ||
      "อื่น ๆ";
    const quantity = getNumber(inventory, "Qty_Total", "Qty", "Quantity", "Total_Quantity", "Available_Quantity", "Qty_Available");

    if (category) {
      categoryNames.add(category);
    }
    quantityByCategory.set(category, (quantityByCategory.get(category) ?? 0) + quantity);
  });

  const transactionActivities = transactions
    .filter((transaction) => {
      const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId");

      return ownerCompanyId === user.companyId || borrowerCompanyId === user.companyId;
    })
    .map((transaction, index) => {
      const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId");
      const inventoryId = getField(transaction, "Inv_ID", "Inventory_ID", "InventoryId");
      const equipmentId =
        getField(transaction, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId") ||
        equipmentIdByInventoryId.get(inventoryId) ||
        inferEquipmentIdFromLegacyTransaction(transaction, inventories) ||
        "";
      const equipmentName =
        equipmentById.get(equipmentId)?.name ||
        getField(transaction, "Equip_Name", "Equipment_Name", "EquipName") ||
        "ยุทโธปกรณ์";
      const quantity = getNumber(transaction, "Qty", "Quantity");
      const borrowDate = getField(transaction, "Borrow_Date", "BorrowDate", "Transaction_Date", "Date");
      const returnDate = getField(transaction, "Return_Date", "Returned_At");
      const status = getField(transaction, "Status");
      const normalizedStatus = status.trim().toLowerCase();
      const isOverdue = normalizedStatus === "overdue";
      const borrowerCompanyName = companyNameById.get(borrowerCompanyId) || "หน่วยงานอื่น";
      const ownerCompanyName = companyNameById.get(ownerCompanyId) || "หน่วยงานอื่น";
      const activityDate = normalizedStatus === "returned" && returnDate ? returnDate : borrowDate;
      const message = normalizedStatus === "returned"
        ? `${borrowerCompanyName} คืน ${equipmentName} จำนวน ${quantity} รายการ ให้ ${ownerCompanyName} เมื่อ ${formatDate(activityDate)}`
        : ownerCompanyId === user.companyId
          ? `${borrowerCompanyName} ได้เบิก ${equipmentName} จำนวน ${quantity} รายการ ไปเมื่อ ${formatDate(borrowDate)}`
          : `ได้เบิก ${equipmentName} จำนวน ${quantity} รายการ จาก ${ownerCompanyName} เมื่อ ${formatDate(borrowDate)}`;

      return {
        id: getField(transaction, "Tx_ID", "Transaction_ID", "TransactionId", "ID") || `${equipmentId}-${index}`,
        message,
        date: activityDate,
        isOverdue,
        kind: isOverdue ? "overdue" as const : normalizedStatus === "returned" ? "return" as const : "borrow" as const,
        href: `/user/history?tx=${encodeURIComponent(getField(transaction, "Tx_ID", "Transaction_ID", "ID"))}`,
      };
    })
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
  const maintenanceActivities = maintenance
    .filter((record) => {
      const inventoryId = getField(record, "Inv_ID", "Inventory_ID", "InventoryId");
      return getField(record, "User_ID", "UserId") === user.userId ||
        inventories.some((inventory) =>
          getField(inventory, "Inv_ID", "Inventory_ID", "InventoryId", "ID") === inventoryId &&
          getField(inventory, "Company_ID", "CompanyId") === user.companyId,
        );
    })
    .map((record, index) => {
      const inventoryId = getField(record, "Inv_ID", "Inventory_ID", "InventoryId");
      const equipmentId = equipmentIdByInventoryId.get(inventoryId) || "";
      const equipmentName = equipmentById.get(equipmentId)?.name || "ยุทโธปกรณ์";
      const date = getField(record, "Reported_At", "Report_Date", "Date");
      return {
        id: getField(record, "Maint_ID", "Maintenance_ID", "ID") || `MNT-${index}`,
        message: `แจ้ง ${equipmentName} ชำรุด จำนวน ${getNumber(record, "Qty", "Quantity")} รายการ เมื่อ ${formatDate(date)}`,
        date,
        isOverdue: false,
        kind: "defect" as const,
        href: `/user/history?tx=${encodeURIComponent(getField(record, "Maint_ID", "Maintenance_ID", "ID") || `MNT-${index}`)}`,
      };
    });
  const activities = [...transactionActivities, ...maintenanceActivities]
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date))
    .slice(0, 3);

  const categories = Array.from(categoryNames).map((name) => ({
    name,
    quantity: quantityByCategory.get(name) ?? 0,
  }));

  return {
    companyName: companyNameById.get(user.companyId) || "หน่วยงานของคุณ",
    categories: categories.sort((a, b) => a.name.localeCompare(b.name, "th")),
    activities,
  };
}

export async function getGlobalEquipmentSearchItems(): Promise<GlobalSearchItem[]> {
  const rawEquipments = await getSheetRows("Equipments");
  const equipments = rawEquipments.length ? rawEquipments : await getSheetRows("Master_Equipments");
  const categories = new Map<string, GlobalSearchItem>();
  const items: GlobalSearchItem[] = [];

  equipments.forEach((equipment, index) => {
    const equipmentId = getField(equipment, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId", "ID") || `EQ-${index}`;
    const name = getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name").trim();
    const category = getField(equipment, "Category", "Category_Name", "Equipment_Category", "Equip_Category").trim() || "อื่น ๆ";
    if (!name) return;

    if (!categories.has(category)) {
      categories.set(category, {
        id: `category:${category}`,
        label: category,
        description: "หมวดหมู่ยุทโธปกรณ์",
        href: `/user/inventory/${encodeURIComponent(category)}`,
        kind: "category",
      });
    }

    items.push({
      id: `equipment:${equipmentId}`,
      label: name,
      description: category,
      href: `/user/inventory/${encodeURIComponent(category)}?equipment=${encodeURIComponent(name)}`,
      kind: "equipment",
    });
  });

  return [...categories.values(), ...items].sort((first, second) => first.label.localeCompare(second.label, "th"));
}

export async function getUserTransactionHistory(user: SessionUser): Promise<UserHistoryItem[]> {
  const [companies, rawEquipments, inventories, transactions, users, maintenance, audits] = await Promise.all([
    getSheetRows("Companies"),
    getSheetRows("Equipments"),
    getSheetRows("Inventories"),
    getSheetRows("Transactions"),
    getSheetRows("Users"),
    getSheetRows("Maintenance"),
    getSheetRows("Audit_Log"),
  ]);
  const equipments = rawEquipments.length ? rawEquipments : await getSheetRows("Master_Equipments");
  const companyNames = new Map(companies.map((company) => [
    getField(company, "Company_ID", "CompanyId", "ID"),
    getField(company, "Company_Name", "CompanyName", "Name"),
  ]));
  const equipmentNames = new Map(equipments.map((equipment) => [
    getField(equipment, "Equip_ID", "Equipment_ID", "EquipId", "ID"),
    getField(equipment, "Equip_Name", "Equipment_Name", "EquipName", "Name"),
  ]));
  const equipmentIdByInventoryId = new Map(inventories.flatMap((inventory) => {
    const inventoryId = getField(inventory, "Inv_ID", "Inventory_ID", "InventoryId", "ID");
    return inventoryId ? [[
      inventoryId,
      getField(inventory, "Equip_ID", "Equipment_ID", "EquipId"),
    ] as const] : [];
  }));
  const userDetails = new Map(users.map((account) => [
    getField(account, "User_ID", "UserId", "ID"),
    {
      name: [
        getField(account, "Rank"),
        getField(account, "First_Name", "FirstName"),
        getField(account, "Last_Name", "LastName"),
      ].filter(Boolean).join(" "),
      phone: getField(account, "Phone", "Phone_Number"),
      email: getField(account, "Gmail", "Recovery_Gmail", "Recovery_Email") || getField(account, "Email"),
    },
  ]));
  const returnUsers = new Map(audits
    .filter((audit) => getField(audit, "Action_Type", "Action").toUpperCase() === "RETURN")
    .map((audit) => [
      getField(audit, "Target_ID", "Record_ID", "Tx_ID"),
      getField(audit, "User_ID", "UserId"),
    ]));
  const rawTransactionHistory: UserHistoryItem[] = transactions
    .filter((transaction) =>
      getField(transaction, "Owner_Company_ID", "OwnerCompanyId") === user.companyId ||
      getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId") === user.companyId,
    )
    .map((transaction, index) => {
      const inventoryId = getField(transaction, "Inv_ID", "Inventory_ID", "InventoryId");
      const equipmentId =
        getField(transaction, "Equip_ID", "Equipment_ID", "EquipId") ||
        equipmentIdByInventoryId.get(inventoryId) ||
        inferEquipmentIdFromLegacyTransaction(transaction, inventories) ||
        "";
      const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId");
      const status = getField(transaction, "Status") || "Unknown";
      const movementType = status.toLowerCase() === "returned" ? "return" : "borrow";
      const transactionId = getField(transaction, "Tx_ID", "Transaction_ID", "TransactionId", "ID") || `TX-${index}`;
      const transactionUserId = movementType === "return"
        ? getField(transaction, "Return_User_ID", "Returned_By_User_ID") || returnUsers.get(transactionId) || getField(transaction, "User_ID", "UserId")
        : getField(transaction, "User_ID", "UserId");
      const transactionUser = userDetails.get(transactionUserId);
      const generatedGroupId = transactionId.match(/^(TX-\d{8}-[A-F0-9]+)-\d+$/i)?.[1];
      const groupId = getField(transaction, "Group_Tx_ID", "Borrow_Batch_ID") || generatedGroupId || transactionId;
      const equipmentName = equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์";
      const quantity = getNumber(transaction, "Qty", "Quantity");
      return {
        id: movementType === "borrow" ? groupId : transactionId,
        transactionIds: [transactionId],
        movementType,
        equipmentName,
        items: [{
          transactionId,
          name: equipmentName,
          quantity,
          plateNumber: getField(transaction, "Plate_Number", "PlateNumber") || undefined,
        }],
        borrowerName: transactionUser?.name || transactionUserId || "ไม่ระบุผู้ทำรายการ",
        contactPhone: transactionUser?.phone || "",
        contactEmail: transactionUser?.email || "",
        quantity,
        ownerCompanyName: companyNames.get(ownerCompanyId) || ownerCompanyId,
        borrowerCompanyName: companyNames.get(borrowerCompanyId) || borrowerCompanyId,
        date: movementType === "return"
          ? getField(transaction, "Return_Date", "Returned_At") || getField(transaction, "Borrow_Date", "Transaction_Date", "Date")
          : getField(transaction, "Borrow_Date", "Transaction_Date", "Date"),
        dueDate: getField(transaction, "Due_Date", "DueDate"),
        status,
        note: getField(transaction, "Note", "Remarks") || "-",
        evidenceImage: getField(transaction, "Evidence_Image", "Evidence", "Evidence_File"),
      };
    });
  const transactionHistory = [...rawTransactionHistory.reduce((groups, item) => {
    if (item.movementType !== "borrow") {
      groups.set(`return:${item.id}`, item);
      return groups;
    }

    const key = `borrow:${item.id}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, item);
      return groups;
    }

    const items = [...current.items, ...item.items];
    groups.set(key, {
      ...current,
      transactionIds: [...current.transactionIds, ...item.transactionIds],
      equipmentName: items.length > 1 ? `เบิกยุทโธปกรณ์ ${items.length} รายการ` : items[0].name,
      items,
      quantity: current.quantity + item.quantity,
      status: current.status.toLowerCase() === "overdue" || item.status.toLowerCase() === "overdue"
        ? "Overdue"
        : current.status,
      evidenceImage: current.evidenceImage || item.evidenceImage,
    });
    return groups;
  }, new Map<string, UserHistoryItem>()).values()];
  const maintenanceHistory: UserHistoryItem[] = maintenance
    .filter((record) => {
      const inventoryId = getField(record, "Inv_ID", "Inventory_ID", "InventoryId");
      const inventory = inventories.find((item) =>
        getField(item, "Inv_ID", "Inventory_ID", "InventoryId", "ID") === inventoryId,
      );
      return getField(record, "User_ID", "UserId") === user.userId ||
        getField(inventory ?? {}, "Company_ID", "CompanyId") === user.companyId;
    })
    .map((record, index) => {
      const inventoryId = getField(record, "Inv_ID", "Inventory_ID", "InventoryId");
      const inventory = inventories.find((item) =>
        getField(item, "Inv_ID", "Inventory_ID", "InventoryId", "ID") === inventoryId,
      );
      const equipmentId = getField(record, "Equip_ID", "Equipment_ID", "EquipId") ||
        getField(inventory ?? {}, "Equip_ID", "Equipment_ID", "EquipId");
      const companyId = getField(inventory ?? {}, "Company_ID", "CompanyId");
      const transactionUserId = getField(record, "User_ID", "UserId");
      const transactionUser = userDetails.get(transactionUserId);
      return {
        id: getField(record, "Maint_ID", "Maintenance_ID", "ID") || `MNT-${index}`,
        transactionIds: [],
        movementType: "defect",
        equipmentName: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์",
        items: [{
          transactionId: "",
          name: equipmentNames.get(equipmentId) || "ไม่ระบุชื่อยุทโธปกรณ์",
          quantity: getNumber(record, "Qty", "Quantity"),
        }],
        borrowerName: transactionUser?.name || transactionUserId || "ไม่ระบุผู้ทำรายการ",
        contactPhone: transactionUser?.phone || "",
        contactEmail: transactionUser?.email || "",
        quantity: getNumber(record, "Qty", "Quantity"),
        ownerCompanyName: companyNames.get(companyId) || companyId || "-",
        borrowerCompanyName: companyNames.get(companyId) || companyId || "-",
        date: getField(record, "Reported_At", "Report_Date", "Created_At", "Date"),
        dueDate: "",
        status: getField(record, "Status") || "Reported",
        note: getField(record, "Note", "Details", "Description") || "-",
        evidenceImage: "",
      };
    });

  return [...transactionHistory, ...maintenanceHistory]
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
}
