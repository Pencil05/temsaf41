import "server-only";

import { google } from "googleapis";
import { hashPassword } from "@/lib/password-utils";

type UserRow = { rowNumber: number; headers: string[]; record: Record<string, string> };

export type AccountProfile = {
  userId: string;
  companyId: string;
  rank: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImage: string;
};

const normalized = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");

function get(record: Record<string, string>, ...names: string[]) {
  const key = Object.keys(record).find((candidate) => names.some((name) => normalized(candidate) === normalized(name)));
  return key ? record[key] : "";
}

function configuration() {
  const email = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.SHEET_ID?.trim();
  if (!email || !key || !spreadsheetId) throw new Error("Google Sheets credentials are missing.");
  return { email, key, spreadsheetId };
}

async function sheetsClient() {
  const config = configuration();
  const auth = new google.auth.JWT({ email: config.email, key: config.key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

async function users() {
  const sheets = await sheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: configuration().spreadsheetId, range: "Users!A:ZZ" });
  const [headers = [], ...rows] = response.data.values ?? [];
  return rows.map((row, index): UserRow => ({
    rowNumber: index + 2,
    headers: headers.map(String),
    record: headers.reduce<Record<string, string>>((record, header, column) => {
      record[String(header)] = String(row[column] ?? "").trim();
      return record;
    }, {}),
  }));
}

function profile(row: UserRow): AccountProfile {
  return {
    userId: get(row.record, "User_ID"), companyId: get(row.record, "Company_ID"),
    rank: get(row.record, "Rank"), firstName: get(row.record, "First_Name"), lastName: get(row.record, "Last_Name"),
    email: get(row.record, "Email"), phone: get(row.record, "Phone", "Phone_Number"),
    profileImage: get(row.record, "Profile_Image_URL", "Profile_Image"),
  };
}

async function updateCells(row: UserRow, values: Array<{ names: string[]; value: string }>) {
  const data = values.map((item) => {
    const index = row.headers.findIndex((header) => item.names.some((name) => normalized(header) === normalized(name)));
    if (index < 0) throw new Error(`Users sheet is missing column: ${item.names[0]}`);
    let current = index + 1;
    let letter = "";
    while (current > 0) { const remainder = (current - 1) % 26; letter = String.fromCharCode(65 + remainder) + letter; current = Math.floor((current - 1) / 26); }
    return { range: `Users!${letter}${row.rowNumber}`, values: [[item.value]] };
  });
  const sheets = await sheetsClient();
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: configuration().spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
}

export async function getAccountById(userId: string) {
  const row = (await users()).find((candidate) => get(candidate.record, "User_ID") === userId);
  return row ? profile(row) : null;
}

export async function getAccountByEmail(email: string) {
  const row = (await users()).find((candidate) => get(candidate.record, "Email").toLowerCase() === email.trim().toLowerCase());
  return row ? profile(row) : null;
}

export async function updateAccountProfile(userId: string, input: { firstName: string; lastName: string; profileImage?: string }) {
  const row = (await users()).find((candidate) => get(candidate.record, "User_ID") === userId);
  if (!row) throw new Error("User not found.");
  const values = [
    { names: ["First_Name"], value: input.firstName.trim() },
    { names: ["Last_Name"], value: input.lastName.trim() },
  ];
  if (input.profileImage) values.push({ names: ["Profile_Image_URL", "Profile_Image"], value: input.profileImage });
  await updateCells(row, values);
  return getAccountById(userId);
}

export async function updateAccountPassword(userId: string, password: string) {
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  const row = (await users()).find((candidate) => get(candidate.record, "User_ID") === userId);
  if (!row) throw new Error("User not found.");
  await updateCells(row, [{ names: ["Password_Hash", "Password"], value: hashPassword(password) }]);
}

export async function updateAccountPhone(userId: string, phone: string) {
  const row = (await users()).find((candidate) => get(candidate.record, "User_ID") === userId);
  if (!row) throw new Error("User not found.");
  await updateCells(row, [{ names: ["Phone", "Phone_Number"], value: phone }]);
}
