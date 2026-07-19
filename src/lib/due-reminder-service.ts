import "server-only";

import { google } from "googleapis";
import { sendLineActivityNotification } from "@/lib/line-oa-notification";

type RecordRow = Record<string, string>;
type Table = { headers: string[]; rows: Array<{ record: RecordRow; rowNumber: number }> };

function field(record: RecordRow, ...names: string[]) { for (const name of names) { const value = record[name]?.trim(); if (value) return value; } return ""; }
function columnName(index: number) { let value = index + 1; let result = ""; while (value) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); } return result; }
function config() { const email = process.env.GOOGLE_CLIENT_EMAIL?.trim(); const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim(); const spreadsheetId = process.env.SHEET_ID?.trim(); if (!email || !key || !spreadsheetId) throw new Error("Google Sheets configuration is incomplete"); return { email, key, spreadsheetId }; }
async function client() { const { email, key } = config(); const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }); return google.sheets({ version: "v4", auth }); }
async function table(name: string): Promise<Table> { const sheets = await client(); const response = await sheets.spreadsheets.values.get({ spreadsheetId: config().spreadsheetId, range: `'${name}'!A:ZZ` }); const values = response.data.values || []; const headers = (values[0] || []).map(String); return { headers, rows: values.slice(1).map((row, index) => ({ rowNumber: index + 2, record: Object.fromEntries(headers.map((header, column) => [header, String(row[column] ?? "")])) })) }; }

export async function sendDueReminders() {
  const [transactions, inventories, equipments, companies] = await Promise.all([table("Transactions"), table("Inventories"), table("Equipments"), table("Companies")]);
  const equipmentById = new Map(equipments.rows.map(({ record }) => [field(record, "Equip_ID", "Equipment_ID", "ID"), field(record, "Equip_Name", "Equipment_Name", "Name")]));
  const inventoryById = new Map(inventories.rows.map(({ record }) => [field(record, "Inv_ID", "Inventory_ID", "ID"), record]));
  const companyById = new Map(companies.rows.map(({ record }) => [field(record, "Company_ID", "ID"), field(record, "Company_Name", "Name")]));
  const reminderHeader = "Reminder_24h_At";
  let reminderColumn = transactions.headers.indexOf(reminderHeader);
  const sheets = await client();
  if (reminderColumn < 0) { reminderColumn = transactions.headers.length; await sheets.spreadsheets.values.update({ spreadsheetId: config().spreadsheetId, range: `'Transactions'!${columnName(reminderColumn)}1`, valueInputOption: "RAW", requestBody: { values: [[reminderHeader]] } }); }
  const now = Date.now();
  const candidates = transactions.rows.filter(({ record }) => { const status = field(record, "Status").toLowerCase(); const due = Date.parse(field(record, "Due_Date", "DueDate")); return ["borrowed", "overdue"].includes(status) && Number.isFinite(due) && due > now && due - now <= 24 * 60 * 60 * 1000 && !field(record, reminderHeader); });
  const updates: Array<{ range: string; values: string[][] }> = [];
  let sent = 0;
  for (const { record, rowNumber } of candidates) {
    const inventory = inventoryById.get(field(record, "Inv_ID", "Inventory_ID")) || {};
    const equipmentId = field(record, "Equip_ID", "Equipment_ID") || field(inventory, "Equip_ID", "Equipment_ID");
    const ownerCompanyId = field(record, "Owner_Company_ID");
    const borrowerCompanyId = field(record, "Borrower_Company_ID");
    const result = await sendLineActivityNotification({ kind: "reminder", actorName: "ระบบ TEMS", ownerCompanyId, ownerCompanyName: companyById.get(ownerCompanyId) || ownerCompanyId, borrowerCompanyId, borrowerCompanyName: companyById.get(borrowerCompanyId) || borrowerCompanyId, referenceId: field(record, "Tx_ID", "Transaction_ID", "ID"), occurredAt: new Date().toISOString(), dueDate: field(record, "Due_Date", "DueDate"), items: [{ name: equipmentById.get(equipmentId) || field(record, "Equip_Name", "Equipment_Name") || "ยุทโธปกรณ์", quantity: Number(field(record, "Outstanding_Qty", "Qty", "Quantity")) || 1, plateNumber: field(record, "Plate_Number") }] });
    if (result.sent) { sent += 1; updates.push({ range: `'Transactions'!${columnName(reminderColumn)}${rowNumber}`, values: [[new Date().toISOString()]] }); }
  }
  if (updates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: config().spreadsheetId, requestBody: { valueInputOption: "RAW", data: updates } });
  return { checked: candidates.length, sent };
}
