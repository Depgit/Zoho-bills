# Zoho Bill Approvals

React + Vite frontend, Node + Express backend, PostgreSQL (Drizzle), bill files in Supabase Storage.

Flow: uploader (PM/CM/OM/FM) uploads a bill -> OCR + AI extraction -> form pre-filled -> approval chain
PM -> CM -> OM -> FM -> bill posted to Zoho Books (+ file attached). An FM's own upload posts straight away.
Rejected bills keep their file so the owner can fix and resubmit. Full backend details: [backend/README.md](backend/README.md).

## Run
    cd backend && cp .env.example .env   # fill values (DATABASE_URL, JWT_SECRET, AI keys, storage)
    npm i && npm run db:up && npm start   # Postgres in Docker on 5433; migrations run on start
    cd ../frontend && npm i && npm run dev   # http://localhost:5173
Register the organisation in the app (it creates the Admin), then the Admin creates FM → OM → CM → PM users.
Moving existing MongoDB data: see "Moving from MongoDB" in [backend/README.md](backend/README.md).

## Zoho setup (India DC)
1. https://api-console.zoho.in -> Self Client. Scopes:
   ZohoBooks.bills.CREATE,ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.settings.READ,ZohoBooks.accountants.READ
2. Generate code -> exchange at https://accounts.zoho.in/oauth/v2/token (grant_type=authorization_code) -> use the client id/secret/refresh_token when registering the organisation in the app.
3. Organisation ID from Zoho Books -> Settings -> Organization Profile.

## Project layout

Every outside dependency has one folder, so replacing it touches only that folder.

```
backend/src/       see backend/README.md -> Files (db/, storage/, integrations/, security/, services/, http/)
frontend/src/
  main.jsx, App.jsx    entry; login/register until signed in, then AppShell
  api/                 the ONLY place that calls the server: client (JWT header), errors (→ popup), auth, bills, admin, zoho
  styles/              all CSS: tokens (colours, spacing), base, layout, controls, tables, feedback, one file per page area
  constants/           roles, tabs per role
  utils/               pure helpers: bill maths, tax, dates, format, session, team…
  hooks/               useRemote (cancellable loads), useUrlState (filters in the URL), useDebounced, useApiList, useBillDocument
  components/common/   reusable UI: Icon, SearchSelect, Modal, StatusBadge, Pagination, SortHeader, FilterChips…
  components/layout/   Navbar, RoleTabs, banners, AppShell
  pages/auth/          LoginPage, RegisterOrgPage and their steps
  pages/upload/        BillFormPage: upload card, bill editor, line items, allocations, my bills (paged)
  pages/review/        ReviewPage: searchable paged queue, bill inspector, tax decision, approve/reject
  pages/history/       HistoryPage: stat tiles, filter bar (team / property / stage / dates / amount), chips, sortable paged table
  pages/admin/         AdminPage: users table, create user, transfer workload
```
Lists are filtered, sorted and paged by the server, so they stay fast as bills grow; filters live in the URL.
Tables turn into cards on phones.
