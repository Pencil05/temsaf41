const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Za-z0-9_]+)="(.*)"$/);
  if (match) envVars[match[1]] = match[2];
}
process.env.GOOGLE_CLIENT_EMAIL = envVars.GOOGLE_CLIENT_EMAIL;
process.env.GOOGLE_PRIVATE_KEY = envVars.GOOGLE_PRIVATE_KEY;
process.env.SHEET_ID = envVars.SHEET_ID;
console.log('env loaded', !!process.env.GOOGLE_CLIENT_EMAIL);
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const spreadsheetId = process.env.SHEET_ID;
console.log({ clientEmail, spreadsheetId, privateKeyPreview: privateKey.slice(0, 80) });
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
auth.authorize().then(() => {
  return google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
    spreadsheetId,
    range: "'Users'!A:ZZ",
  });
}).then((res) => {
  console.log('rows', (res.data.values || []).length);
  console.log(JSON.stringify(res.data.values || []).slice(0, 2000));
}).catch((err) => {
  console.error('ERR', err.message);
  if (err.errors) console.error(err.errors);
  process.exitCode = 1;
});
