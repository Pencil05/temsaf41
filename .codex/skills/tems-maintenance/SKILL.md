---
name: tems-maintenance
description: Maintain and extend the TEMS Next.js 16 application, especially Google Sheets inventory transactions, user-specific receipts, responsive Tailwind UI, authentication, OTP, return/borrow/defect flows, and modal state. Use for any implementation, debugging, or review inside the TEMS repository.
---

# TEMS Maintenance

## Work efficiently

1. Read `AGENTS.md`, then use `rg` to locate symbols and inspect only relevant ranges.
2. Trace one flow end-to-end: Sheets row -> server service/type -> page props -> client state -> receipt/UI.
3. Patch the root data source; avoid client-side fallbacks that substitute the currently logged-in user.
4. Reuse existing popup classes, loading UI, receipt component, image mapper, and theme tokens.
5. Run focused ESLint, `npx tsc --noEmit`, then `next build --webpack` for shared types or services.

## Data invariants

- Treat `Users.User_ID` as the identity key. Resolve rank/name/phone/Gmail from the transaction's `User_ID`.
- A receipt's operator contact belongs to the user who created that transaction, not the viewer.
- Group multi-item borrows by `Group_Tx_ID`; preserve the initiating user's identity and evidence.
- Vehicle identity is inventory/plate-specific; never merge vehicle selection by equipment ID alone.
- Borrow moves quantity owner -> borrower. Return targets the original owner and cannot exceed outstanding quantity.
- Keep Google Sheets reads/writes in server-only modules and API routes.

## UI invariants

- Mobile-first; use two-column form fields at `sm` or larger when space permits.
- Keep confirmation/receipt modals open until explicit cancel/close. Do not navigate during intermediate states.
- Use `.popup-backdrop` and `.popup-panel` for animated dialogs.
- Preserve light/dark theme readability and touch active feedback.

## Relevant locations

- Sheets/history: `src/lib/google-sheets.ts`
- Borrow: `src/lib/borrow-service.ts`, `src/components/borrow/`
- Return/defect: `src/lib/inventory-action-service.ts`, `src/components/dashboard/dashboard-actions.tsx`
- Account/profile: `src/lib/account-service.ts`, `src/components/account/`
- Receipts/history: `src/components/receipt/`, `src/components/history/`
