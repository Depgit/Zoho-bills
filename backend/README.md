# Backend — Zoho Bill Approvals

Node + Express + PostgreSQL (Drizzle ORM), bill files in Supabase Storage. Managers upload vendor bills, an AI extracts the
fields, the bill climbs an approval chain, and the Finance Manager's approval posts it to
Zoho Books with the file attached.

## Hierarchy

```
ADMIN (exactly one per org, created at registration) — users, roles, reporting lines, transfers, all bills
FM  Finance Manager      ── final approver; approval posts to Zoho
 └─ OM  Operations Manager
     └─ CM  Cluster Manager
         └─ PM  Property Manager
```

Many FMs, OMs, CMs and PMs. Every PM, CM and OM has `managerId`, pointing at a user of the role directly above (`services/hierarchy.service.js`).

## Workflow

```
upload file ──► POST /bills/extract ──► OCR + AI ──► form pre-filled (file saved in file storage)
save draft  ──► POST /bills {draft:true}   status DRAFT (assigned PMs already see it)
submit      ──► POST /bills | PUT /bills/:id
                  PM → waits on their CM │ CM → their OM │ OM → their FM │ FM → posted to Zoho now
approve     ──► POST /bills/:id/approve  at CM/OM: moves to that approver's own manager
                                         at FM: tax slab auto-picked → Zoho bill + attachment → POSTED
reject      ──► POST /bills/:id/reject   REJECTED (stage = who rejected) → back to the owner = whoever uploaded it (never the assigned PMs)
owner edits ──► PUT /bills/:id           resubmitting restarts the chain from the owner's level
```

- **Assigning PMs:** every bill has `allocations [{ pmId, amount }]`, and the amounts add up to the bill total.
  - A PM's own bill is assigned to them in full.
  - A CM, OM or FM must pick one or more PMs below them in the hierarchy and split the amount.
- **Location:** chosen on the form, preselected from the uploader's default location. Its state decides GST vs IGST.
- **Ownership:** `createdBy` is who uploaded the bill (kept for the record). `ownerId` is who can edit and resubmit it, and it moves when the Admin transfers a workload.
- **Who can edit:** the owner can edit a draft, a rejected bill, or a pending bill nobody has approved yet.

### Roles

| Role           | Can                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`      | Create users; change anyone's role, reporting line and default location; transfer a CM/OM/FM workload; see all bills; approve or reject any pending bill on behalf of whoever it waits on; delete any bill not yet posted |
| `FM`         | Approve or reject bills waiting on them (approval posts to Zoho); upload bills that post to Zoho straight away                                                                                                            |
| `OM`, `CM` | Approve or reject bills waiting on them; upload bills that start at their own manager                                                                                                                                     |
| `PM`         | Upload their own bills; see every bill assigned to them, including drafts                                                                                                                                                 |

### Admin: changing the hierarchy

- **Changing someone's manager** (`PATCH /admin/users/:id { managerId }`): their own bills still waiting on the old manager move to the new one.
- **Changing someone's role:** blocked while anything is still assigned to them (people reporting to them, pending approvals, open bills they own, or open bills assigned to them). Transfer that work first.
- **Transferring a workload** (`POST /admin/users/:id/transfer { toUserId }`): only CM, OM or FM, and only to another user with the same role. It moves:

  - bills waiting on their approval (`approverId`)
  - the people who report to them (`managerId`)
  - every bill they own (`ownerId`)

  Afterwards the old user has nothing assigned and can be deleted.
- **Deleting a user:** only allowed once nothing is assigned to them.

## Files

**Rule: every outside dependency lives in exactly one folder.** Swapping the database, file storage,
Zoho, an AI provider or the OCR engine only changes that folder; services never see SQL, SDKs or HTTP.

```
src/
  server.js      start-up: database → migrations → background jobs → HTTP server
  config/        env.js (reads .env), tls.js (TLS patch for Render)
  db/            PostgreSQL — the ONLY code with SQL
    client.js      connection pool + drizzle
    schema/        one file per table (drizzle)          migrations/  generated SQL
    repositories/  users, orgs, bills/ (criteria → SQL, mapper, read, write), files, contacts,
                   vendorAccounts, extractionLogs, extractionCache, transfers
    index.js       what the rest of the app may use
  storage/       file bytes: put / get / remove by key — drivers/local.js, drivers/supabase.js
  security/      passwords.js (bcrypt), tokens.js (JWT)
  integrations/  outside services
    zoho/          Zoho Books API (no database access)
    ai/            Gemini / DeepSeek / Groq providers, prompt, race
    ocr/           Tesseract + PDF text / page handling
  services/      business rules only (call db/, storage/, integrations/)
    auth/ users/ bills/ vendors/ extraction/ learning/
    hierarchy, gst, locations, files, zohoCatalog
  http/          Express only: app.js, routes/, controllers/ (request in, response out),
                 middleware/, presenters/ (object → JSON)
  jobs/          cleanup (hourly: unused files, files of bills rejected > 10 days, old unsubmitted extraction logs), syncContacts (on start)
  utils/         httpError
scripts/         db-migrate.js, migrate-mongo-to-pg.js (one-off copy from MongoDB)
tests/           flow.e2e.js (whole API), learning.e2e.js — run against a throwaway database
```

| Path | What it does |
| --- | --- |
| `db/repositories/bills/criteria.js` | Turns a plain search description (visibility, status, stage, dates, text, team area, property, amount…) into SQL |
| `services/bills/filters.js` | Validates the `GET /bills` query string into that description |
| `services/bills/visibility.js` | Who may see which bills, and the queue / history / mine scopes |
| `services/bills/listing.js` | One page of bills + status totals + per-property totals |
| `services/bills/actions.js` | Create, edit, delete, open the file, approve / reject |
| `services/bills/` (rest) | total, allocations, location, validation, workflow (approval chain), save, present, postToZoho, learning hooks |
| `services/users/` | admin actions, validation, workload, transfer |
| `services/extraction/` | upload (store + read a file), cache (in the database), parseOcr, normalise, timing |
| `services/learning/` | Learning from corrections: record, compare, similarity, lookup, hints, fewShot |
| `services/files.service.js` | File record in the database + bytes in `storage/` |
| `services/gst.service.js` | GSTIN → state table and the GST vs IGST rule (`taxPlan`) |
| `services/hierarchy.service.js` | Roles, who reports to whom (`MANAGER_ROLE`), PMs / team below a user |

### Database tables

`finance_orgs`, `users` (`manager_id` → users), `files`, `bills` (+ `bill_line_items`, `bill_allocations`,
`bill_history`), `contacts`, `vendor_account_maps`, `extraction_logs`, `extraction_cache`.
Ids are UUIDs. Money is `numeric(14,2)`. A bill's `total` is stored so lists can sort and filter by amount.
Saving a bill (row, lines, allocations, new history) and a workload transfer each run in one transaction.

Changing the schema: edit `src/db/schema/`, run `npm run db:generate`, commit the new file in `src/db/migrations/`.
Migrations run automatically on start-up.

## API

All routes except register and login need `Authorization: Bearer <jwt>`.

**Errors:** every error comes back as `{ error: "message" }` with an HTTP status, and the frontend shows it in a popup. Controllers and services throw `httpError(status, msg)`, and `middleware/errorHandler.js` turns it into JSON.

**Auth** (`/api/auth`)

- `POST /register`: creates the organisation's Admin and FinanceOrg (checks the Zoho credentials). Each Zoho organisation can be registered once.
- `POST /login`: returns `{ token, user }`. `user` includes `role`, `managerId` and the default location. The token lasts 12h.

**Admin** (`/api/admin`, ADMIN only)

- `GET /users`: everyone in the org, with `managerId` populated and their open `workload`.
- `POST /users`: `{ name, email, password, role: PM|CM|OM|FM, managerId, location_id }`. PM, CM and OM need a `managerId` of the role above. A PM needs a location; for other roles it's optional.
- `PATCH /users/:id`: `{ role?, managerId?, location_id? }`.
- `POST /users/:id/transfer`: `{ toUserId }`.
- `DELETE /users/:id`.

**Bills** (`/api/bills`)

- `POST /extract` (PM, CM, OM, FM): multipart `file` (PDF or image, max 10 MB), optional `pages=all`. Returns `{ pdfFile, fileType, extracted, extractMeta }`.
- `GET /assignable-pms`: the PMs I can assign a bill to.
- `GET /team` (CM, OM, FM, ADMIN): everyone below me (Admin: the whole org) with `role` and `managerId`, used by the history OM / CM filters.
- `GET /properties?…filters`: count and amount per property (PM) and status, for the same filters as `GET /` (ignores `pmId` and the status filters).
- `GET /expenses?…filters`: count and amount per expense account (ignores the status filters). Each line's part of a bill is its gross amount (qty × rate + tax) out of all its lines; with `pmId` it is that property's share, for a PM their own share.
- `POST /`: create a bill from `{ pdfFile, ...fields, location_id, allocations, draft }`.
  - `draft: true` saves it as a DRAFT, which only needs the file and a location.
  - Otherwise it's submitted. That needs the vendor, bill number, date and valid lines, the allocations must add up to within ₹1 of the total, and the bill number must be unique for the vendor.
- `PUT /:id`: the owner edits the bill, with the same body; `draft` decides whether it's resubmitted.
- `DELETE /:id`: the owner or the Admin deletes a bill that isn't POSTED.
- `GET /?scope=&…filters`: one page of bills, filtered and sorted by the database.
  Returns `{ rows, total, page, pageSize, summary }`. Each row has `id`, `amount` (a PM's own share, otherwise the bill total),
  `total`, `owner` / `creator` / `approver` (`{ id, name, role }`), `allocations[].pm`, `history`, `vendorGstin` and `taxInfo`.
  `summary` = count and amount per status plus pending per stage; it ignores the status / stage filters.
  - `scope`:
    - `queue` (default): bills waiting on me. For the Admin, all pending bills.
    - `history`: everything I can see. For a PM, bills assigned to them or owned by them. For a CM, OM or FM, bills assigned to any PM below them, bills they own, bills waiting on them, or bills they acted on. For the Admin, every bill.
    - `mine`: bills I own.
  - Filters: `status` (comma list), `stage` (CM,OM,FM), `from` / `to` (YYYY-MM-DD, bill date), `q` (bill no., vendor, PM / property, comments),
    `managerId` (that OM's / CM's whole area), `pmId` (a property; `unassigned` = no PM yet), `ownerId`, `vendorId`,
    `accountId` (a line uses this expense account), `minAmt` / `maxAmt`, `hasZohoError=1`,
    `pendingOnMe=1` (only bills waiting on my approval; Admin: every pending bill — `summary.pendingOnMe` has the count for CM / OM / FM / Admin).
  - `sort=field:asc|desc` (date, amount, billNumber, vendor, status, updated), `page`, `pageSize` (10, 25, 50, 100).
- `GET /:id/pdf`: the bill's file, if I can see the bill.
- `POST /:id/approve | /:id/reject`: only the approver the bill waits on, or the Admin. Rejecting needs a `comment`. At FM, `lineItems[].tax_id` can override the tax slabs.
- `GET/POST /vendor-account-map`: remembers the uploader's default expense account for each vendor.

**Zoho** (`/api/zoho`):

- `GET /accounts`, `/contacts?search=`: uploaders only.
- `GET /taxes`, `/locations`: any logged-in user. Each location has a resolved `state_code`.
- `POST /sync`: Admin or FM; re-syncs vendor contacts.

## Key logic

### Extraction (`services/extraction/`)

1. **Cache:** if this exact file was seen before (`EXTRACT_CACHE` on), the saved result is returned.
2. **Text** (`integrations/ocr/`):
   - **PDF with real text:** every page is read straight from the file — `pdftotext -layout` (Poppler) when it's installed, else pdf.js. Columns stay lined up, so table rows (qty / rate / amount) reach the AI intact. Very long PDFs are cut to the first 60% + last 40% of 60,000 characters.
   - **Scanned PDF:** pages are rendered and read with Tesseract — first 2 + last 2 pages, or all with `pages=all`.
   - **Image:** Tesseract.
   - Poppler: `brew install poppler` (Mac) / `apt-get install poppler-utils`; the `Dockerfile` installs it. Without it everything still works through pdf.js. `PDFTOTEXT_PATH` points at a non-standard binary.
3. **Regex:** picks out GSTIN, invoice number, date, tax % and total.
4. **AI:** Gemini, DeepSeek and Groq get the text in parallel. The **first usable result wins** and the others aren't waited for. If every AI fails, the regex result is used.
5. **Single line:** the PM form turns all extracted items into one line, with rate = the sum of qty × rate before tax.

### Learning from corrections (`services/learning/`)

No model training. Each extraction is logged, then compared with what the PM actually submitted.

- **Logging:**
  - `POST /extract` saves the scanned text (up to 8 KB), the raw AI output and which provider answered. The log is keyed by `financeOrgId` and `fileId` (= `pdfFile`).
  - `POST /` and `PUT /:id` save the submitted values and the corrections, field by field: vendor name, GSTIN, invoice no, date, tax % and subtotal.
- **Finding earlier bills:** by vendor GSTIN, or by how similar the scanned text is. Text similarity matters when the vendor GSTIN isn't readable, for example a receipt that only shows the buyer's GSTIN.
- **Your own GSTINs:** a GSTIN that PMs corrected away from at least 2 times is treated as the company's own. It's never used as the vendor GSTIN, and the AI prompt is told so.
- **Examples in the prompt:** up to 3 of the most similar earlier approved bills.
- **Vendor memory:** if `vendor_name` or `tax_percent` was corrected to the same value at least 2 times, that value is applied.
- **Same document uploaded again:** if the text is at least 85% similar and the AI read the same invoice number, the whole corrected result is reused, including the invoice number and date.
- **Scope:** every lookup is limited to the same `financeOrgId`. Logs never submitted are auto-deleted after 30 days.
- **Safety:** errors are logged and never block extract or submit.

### File storage (`storage/` + `services/files.service.js`)

- The bytes go to file storage (`STORAGE_DRIVER`: `supabase` in production, `local` disk for development); the `files` table keeps the record, and `pdfFile` on a bill is that record's id. Render's disk is wiped on every deploy, so production must use Supabase.
- If a file's record exists but its bytes are missing (e.g. the storage driver was changed without copying files), `GET /:id/pdf` returns 404 and logs a warning.
- **When files are deleted:**
  - When the owner or the Admin deletes the bill.
  - After the file is attached in Zoho.
  - By the hourly cleanup, if it's over 1 hour old and no bill uses it.
  - By the hourly cleanup, when a bill has stayed **rejected for more than `REJECTED_FILE_DAYS` (10) days** since its last rejection. The bill and its data stay; its history gets a `FILE_REMOVED` entry, and the owner must upload the file again (the edit page asks for it and keeps the filled-in details) before resubmitting.
- Draft and pending bills keep their file; rejected bills keep it for 10 days.
- **Bill data is never deleted automatically.** Only the file is.

### Tax: GST vs IGST (`services/gst.service.js`)

- **Vendor state:** the first 2 digits of the vendor GSTIN. The GSTIN comes from the Zoho contact, or from the extracted data if Zoho has none.
- **Property state:** the `source_of_supply` of the location picked on the bill, which defaults to the uploader's own location. The backend looks the location up in Zoho and takes the state from it: `address.state_code` (e.g. `HR`), else the first 2 digits of the location's GSTIN (`tax_reg_no`), else the state name. It never trusts the request body for the state.
- **The rule:**
  - Same state: GST slab (CGST + SGST).
  - Different states: IGST slab.
  - In both cases the slab is matched to the line's `tax_percentage`.
  - No vendor GSTIN, or 0%: no tax slab.
- At FM approval (or an FM's own upload), slabs are filled in automatically. The FM can override them during approval. Posting is blocked only when the slab can't be worked out.

### Posting to Zoho (`integrations/zoho/bills.js` → `createBill`)

- **States:**
  - `source_of_supply` = the vendor's state.
  - `destination_of_supply` = the property's state.
- **Discount:**
  - It's a percentage of the subtotal (or a flat amount), taken off **after** tax: total = subtotal + tax − discount.
  - It's sent with `is_discount_before_tax: false` and `discount_type: entity_level`.
  - `discount_account_id` is the Zoho account named "Discount". That account must exist in Zoho.
- **The file:** it's attached in Zoho after the bill is created. If attaching fails, the bill is still POSTED and `zohoError` is set.

## Bill statuses

`DRAFT → PENDING (stage CM → OM → FM, waiting on approverId) → POSTED`, or `REJECTED` (stage = the level that rejected).

- **Starting point:** a bill enters the chain at the stage above its owner (`firstStage`), and an FM's own bill posts to Zoho immediately.
- **Approving:** each approval moves the bill to the current approver's own manager. If that manager is missing, approval fails with a message to ask the Admin.
- **History:** `bill_history` rows (`history[]` in the API) record `{ by, byId, role, action, comment, at }`. The actions are DRAFT_SAVED, SUBMITTED, RESUBMITTED, APPROVED, REJECTED and POSTED.
- **Allocations:** used in the app only (history and analytics per property). Zoho gets one bill.

## Environment (`.env`)

See `.env.example`.

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. Local: `postgres://zoho:zoho@127.0.0.1:5433/zoho_bills`. Supabase: the pooler connection string (TLS is switched on automatically for non-local hosts) |
| `JWT_SECRET`, `PORT` | Core |
| `ENCRYPTION_KEY` | **Required.** Encrypts the Zoho credentials stored in the database (`openssl rand -base64 32`). Keep it safe and the same across deploys — without it the stored credentials can't be read and the org has to register again |
| `STORAGE_DRIVER` | `local` (files under `STORAGE_LOCAL_DIR`, default `./data/files`) or `supabase` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | Supabase Storage (private bucket, default `bill-files`). The service key stays on the server |
| `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY` | AI providers (at least one is required) |
| `GEMINI_MODEL`, `DEEPSEEK_MODEL`, `GROQ_MODEL`, `GEMINI_MIN_GAP_MS` | Model overrides; minimum gap between Gemini calls (default 4500) |
| `EXTRACT_CACHE` | `off` disables the extraction cache (now a database table) |
| `DEBUG_OCR` | `true` logs OCR/AI details. A one-line timing summary is always logged |
| `REJECTED_FILE_DAYS` | Days a rejected bill keeps its uploaded file (default 10) |
| `MONGO_URI` | Only for the one-off copy from MongoDB |

Zoho credentials are **not** in `.env`. They're stored for each org in `finance_orgs` at registration — **encrypted** (AES-256-GCM, `security/secrets.js`): the table only shows `enc:v1:…`, the `orgs` repository decrypts them in memory just before a Zoho call. The API never returns them. Token requests send them in the form body (not the URL), and server logs print only error messages and stacks. Older plain-text rows: `npm run secrets:encrypt` (safe to run again).

## Run

```
npm i
npm run db:up      # PostgreSQL in Docker (port 5433)
npm start          # applies migrations, then serves on PORT
npm run dev        # same, restarting automatically when a file changes
```

## Tests

```
npm test           # tests/flow.e2e.js (whole API: chain, filters, admin…) + learning.e2e.js + read.e2e.js (PDF / OCR reading)
```

They use the database `zoho_bills_test` (create it once: `createdb -h 127.0.0.1 -p 5433 -U zoho zoho_bills_test`)
and wipe it on every run. Zoho calls point at a closed port, so Zoho errors in the log are expected.
After a run, every test user can sign in with password `test1234` — e.g. `admin@test.local`, `fm2@test.local`,
`om1@test.local`, `cm1@test.local`, `pm1@test.local` — handy for trying the API with curl:

```
TOKEN=$(curl -s -X POST localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.local","password":"test1234"}' | jq -r .token)
curl -s "localhost:5000/api/bills?scope=history&status=PENDING&sort=amount:desc" -H "Authorization: Bearer $TOKEN"
```

(Start the server with `DATABASE_URL=postgres://zoho:zoho@127.0.0.1:5433/zoho_bills_test JWT_SECRET=test`.)

## Deploy (Render)

- **Docker (recommended):** Runtime = Docker, Root Directory = `backend`. The `Dockerfile` installs Poppler for the best PDF text.
- **Plain Node:** build `npm ci`, start `npm start`. Works too; PDFs are then read with pdf.js instead of pdftotext.
- Set the variables from `.env.example` (`DATABASE_URL` = Supabase connection string, `STORAGE_DRIVER=supabase`, …).

## Copying a database (e.g. local → production)

```
TARGET_DATABASE_URL="<prod url>" TARGET_ENCRYPTION_KEY="<prod key>" npm run db:copy -- --dry-run
TARGET_DATABASE_URL="<prod url>" TARGET_ENCRYPTION_KEY="<prod key>" npm run db:copy
```

- Source = `DATABASE_URL` + `ENCRYPTION_KEY` from `.env`. Copies organisations, users (same emails / passwords, reporting lines), bills with lines / allocations / history, contacts, vendor accounts, extraction logs and cache — with the same ids.
- **Files are not copied**: bills arrive without a file (owners re-upload when editing); file storage isn't touched.
- Zoho credentials are re-encrypted with the target's key (`TARGET_ENCRYPTION_KEY`, defaults to the source key).
- The target's tables are created first. It only writes into an empty target; `--wipe-target` empties it first. One transaction — all or nothing.

## Moving from MongoDB (one-off)

```
node scripts/migrate-mongo-to-pg.js --dry-run   # read + check, writes nothing
npm run db:copy-from-mongo                      # copy (safe to run again)
```

- MongoDB is only read. Every ObjectId becomes a fixed UUID, so references stay intact and re-runs update the same rows.
- GridFS files that a bill still uses are copied into file storage (`STORAGE_DRIVER`); unused uploads are skipped.
- Bills from the old two-level flow are mapped: `PENDING_FINANCE` → pending at FM, `REJECTED_L1` → rejected at CM.
- Records of a deleted organisation are skipped and listed; `--adopt-orphans` moves them into the one remaining organisation instead.
- A count report (MongoDB vs PostgreSQL) is printed at the end. Everyone has to sign in again after the switch (ids changed).
