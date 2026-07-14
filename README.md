## TEMS

Tactical Equipment Management System for กองพันทหารอากาศโยธิน กองบิน 41.

### Google Sheets setup

1. Copy `.env.local.example` to `.env.local` and add the Google service account values.
2. Share spreadsheet `1O7UBSJiPKffZVG6isyTrDD1qUpPtvAQ5ZcUiogIzuf4` with `GOOGLE_CLIENT_EMAIL` as an Editor.
3. The integration expects the `Users`, `Companies`, `Master_Equipments`, `Inventories`, and `Transactions` sheet tabs and their documented ID/name columns.

For OTP and profile photos, add these columns to the `Users` sheet:

- `Phone` — mobile number used to receive OTP.
- `Profile_Image_URL` — stores the compressed 128x128 profile image data URL.

The complete recommended `Users` header is:

`User_ID | Company_ID | Role | Rank | First_Name | Last_Name | Email | Password_Hash | Phone | Profile_Image_URL`

For borrowing evidence and reliable multi-item receipts, use these columns in `Transactions`:

- `Evidence_Image` — compressed JPEG data URL for the evidence photo. The current spreadsheet already has this column.
- `Return_Evidence_Image` — compressed JPEG data URL for optional return evidence. The API adds this column automatically when it is missing.
- `Group_Tx_ID` — recommended batch ID shared by every item in one multi-item borrow.
- `Destination_Inventory_ID` — recommended inventory ID created or updated at the borrower company.
- `Equip_ID` and `Plate_Number` — recommended direct references that make historical lookups resilient.

The app limits stored evidence images to about 42 KB so each value remains below the Google Sheets per-cell limit. For larger production images, replace data URLs with a Google Drive or Cloud Storage URL while keeping the same `Evidence_Image` column.

Set `SMS_WEBHOOK_URL` to an SMS provider endpoint for production OTP delivery. Without it, development mode returns a test OTP on screen.

### Production OTP delivery

The password flow is: enter phone number, request OTP, verify the six-digit code, and only then show the new-password form. After successful verification, the app stores the verified number in `Users.Phone`.

Configure these environment variables for real SMS delivery:

- `SMS_WEBHOOK_URL` — HTTPS endpoint of your SMS gateway adapter.
- `SMS_WEBHOOK_AUTH_TOKEN` — optional bearer token sent in the `Authorization` header.
- `SMS_SENDER_NAME` — sender name, normally `TEMS`.

The webhook receives JSON in this format:

```json
{
  "to": "0812345678",
  "sender": "TEMS",
  "message": "รหัส OTP สำหรับ TEMS คือ 123456 (หมดอายุใน 5 นาที)"
}
```

Production refuses to issue a fake OTP when `SMS_WEBHOOK_URL` is missing. Development mode still displays a test code for local testing.

### LINE friend picker

Receipt sharing uses the mobile operating system's native share sheet. On a supported mobile browser, choose LINE from the normal Share button and LINE will present its own recipient screen. File sharing requires HTTPS (or localhost) and a browser that supports the Web Share API with files.

Run the app with `npm run dev` on the mapped `X:` drive.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The app is already wired to use Google Sheets as its data source, so deployment mainly requires the same environment variables used locally.

1. Import this repository into Vercel and choose the root folder.
2. In Project Settings → Environment Variables, add the values from [.env.production.example](.env.production.example):
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SHEET_ID` (set to `1O7UBSJiPKffZVG6isyTrDD1qUpPtvAQ5ZcUiogIzuf4`)
   - `SESSION_SECRET`
   - `ALLOW_MOCK_AUTH=false`
   - optional SMS variables if you want OTP delivery to work in production.
3. Deploy the project. The app will read the spreadsheet from the same shared Google Sheet automatically.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
