import "server-only";

import { google } from "googleapis";
import type { SessionUser } from "@/lib/auth-session";

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

export type DashboardCategory = {
  name: string;
  quantity: number;
};

export type DashboardActivity = {
  id: string;
  message: string;
  date: string;
  isOverdue: boolean;
};

export type UserDashboardData = {
  companyName: string;
  categories: DashboardCategory[];
  activities: DashboardActivity[];
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
  try {
    const { spreadsheetId } = getGoogleConfiguration();
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:ZZ`,
    });
    const [headers = [], ...values] = response.data.values ?? [];

    return values
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
  } catch (error) {
    console.error("Google Sheets lookup failed", error);
    return [];
  }
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "ไม่ระบุวันที่";
  }

  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
}

function getRole(value: string): "Admin" | "User" {
  return ["admin", "commander"].includes(value.trim().toLowerCase()) ? "Admin" : "User";
}

export async function authenticateUser(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const users = await getSheetRows("Users");
    const user = users.find((record) => {
      const loginName = getField(record, "Email", "Username", "User_Name").toLowerCase();
      const storedPassword = getField(record, "Password", "Password_Hash");
      const storedPasswordHash = getField(record, "Password_Hash", "Password");

      if (loginName !== normalizedEmail) {
        return false;
      }

      if (storedPassword && storedPassword === password) {
        return true;
      }

      if (storedPasswordHash && storedPasswordHash === password) {
        return true;
      }

      return false;
    });

    if (user) {
      return {
        userId: getField(user, "User_ID", "UserId", "ID"),
        companyId: getField(user, "Company_ID", "CompanyId"),
        email: getField(user, "Email", "Username", "User_Name"),
        role: getRole(getField(user, "Role", "User_Role")),
        rank: getField(user, "Rank"),
        firstName: getField(user, "First_Name", "FirstName"),
        lastName: getField(user, "Last_Name", "LastName"),
      };
    }
  } catch (error) {
    console.error("Google Sheets authentication failed", error);
  }

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
  const [companies, rawEquipments, inventories, transactions] = await Promise.all([
    getSheetRows("Companies"),
    getSheetRows("Equipments"),
    getSheetRows("Inventories"),
    getSheetRows("Transactions"),
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

  const activities = transactions
    .filter((transaction) => {
      const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId");

      return ownerCompanyId === user.companyId || borrowerCompanyId === user.companyId;
    })
    .map((transaction, index) => {
      const ownerCompanyId = getField(transaction, "Owner_Company_ID", "OwnerCompanyId");
      const borrowerCompanyId = getField(transaction, "Borrower_Company_ID", "BorrowerCompanyId");
      const equipmentId = getField(transaction, "Equip_ID", "Equipment_ID", "EquipId", "EquipmentId");
      const equipmentName =
        equipmentById.get(equipmentId)?.name ||
        getField(transaction, "Equip_Name", "Equipment_Name", "EquipName") ||
        "ยุทโธปกรณ์";
      const quantity = getNumber(transaction, "Qty", "Quantity");
      const borrowDate = getField(transaction, "Borrow_Date", "BorrowDate", "Transaction_Date", "Date");
      const status = getField(transaction, "Status");
      const isOverdue = status.trim().toLowerCase() === "overdue";
      const borrowerCompanyName = companyNameById.get(borrowerCompanyId) || "หน่วยงานอื่น";
      const ownerCompanyName = companyNameById.get(ownerCompanyId) || "หน่วยงานอื่น";
      const message =
        ownerCompanyId === user.companyId
          ? `${borrowerCompanyName} ได้เบิก ${equipmentName} จำนวน ${quantity} รายการ ไปเมื่อ ${formatDate(borrowDate)}`
          : `ได้เบิก ${equipmentName} จำนวน ${quantity} รายการ จาก ${ownerCompanyName} เมื่อ ${formatDate(borrowDate)}`;

      return {
        id: getField(transaction, "Transaction_ID", "TransactionId", "ID") || `${equipmentId}-${index}`,
        message,
        date: borrowDate,
        isOverdue,
      };
    })
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date))
    .slice(0, 8);

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
