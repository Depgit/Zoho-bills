# Zoho Bill Approvals (MERN)

Flow: uploader (PM/CM/OM/FM) uploads a bill -> OCR + AI extraction -> form pre-filled -> approval chain
PM -> CM -> OM -> FM -> bill posted to Zoho Books (+ file attached). An FM's own upload posts straight away.
Rejected bills keep their file so the owner can fix and resubmit. Full backend details: [backend/README.md](backend/README.md).

## Run
    cd backend && cp .env.example .env   # fill values
    npm i && npm run seed && npm start
    cd ../frontend && npm i && npm run dev   # http://localhost:5173
Seed users (password123): pm@example.com, l1@example.com, fin@example.com

## Zoho setup (India DC)
1. https://api-console.zoho.in -> Self Client. Scopes:
   ZohoBooks.bills.CREATE,ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.settings.READ,ZohoBooks.accountants.READ
2. Generate code -> exchange at https://accounts.zoho.in/oauth/v2/token (grant_type=authorization_code) -> use the client id/secret/refresh_token when registering the organisation in the app.
3. Organisation ID from Zoho Books -> Settings -> Organization Profile.

## Project layout

```
backend/src/       see backend/README.md -> Files
frontend/src/
  main.jsx, App.jsx    entry; login/register until signed in, then AppShell
  api/                 axios client (JWT header) + error -> popup event
  constants/           roles, tabs per role
  utils/               pure helpers: bill maths, tax, dates, format, session...
  hooks/               useApiList, useBillDocument
  components/common/   reusable UI: Icon, SearchSelect, ErrorModal, Modal, StatusBadge, Spinner...
  components/layout/   Navbar, RoleTabs, WelcomeBanner, AppShell
  pages/auth/          LoginPage, RegisterOrgPage and their steps
  pages/upload/        BillFormPage: upload card, bill editor, line items, allocations, my bills
  pages/review/        ReviewPage: queue list, bill inspector, tax decision, approve/reject
  pages/history/       HistoryPage: filters, KPIs, bills table, preview/delete modals
  pages/admin/         AdminPage: users table, create user, transfer workload
```
One component or one job per file; page-specific pieces live next to their page.
