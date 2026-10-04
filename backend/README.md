# Backend — Zoho Bill Approvals

Node + Express + MongoDB (Mongoose). Managers upload vendor bills, an AI extracts the
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
Many FMs, OMs, CMs and PMs. Every PM, CM and OM has `managerId`, pointing at a user of the role directly above (`hierarchy.js`).

## Workflow

```
upload file ──► POST /bills/extract ──► OCR + AI ──► form pre-filled (file saved in GridFS)
save draft  ──► POST /bills {draft:true}   status DRAFT (assigned PMs already see it)
submit      ──► POST /bills | PUT /bills/:id
                  PM → waits on their CM │ CM → their OM │ OM → their FM │ FM → posted to Zoho now
approve     ──► POST /bills/:id/approve  at CM/OM: moves to that approver's own manager
                                         at FM: tax slab auto-picked → Zoho bill + attachment → POSTED
reject      ──► POST /bills/:id/reject   REJECTED (stage = who rejected) → back to the owner
owner edits ──► PUT /bills/:id           resubmitting restarts the chain from the owner's level
```

- **Assigning PMs:** every bill has `allocations [{ pmId, amount }]`, and the amounts add up to the bill total.
  - A PM's own bill is assigned to them in full.
  - A CM, OM or FM must pick one or more PMs below them in the hierarchy and split the amount.
- **Location:** chosen on the form, preselected from the uploader's default location. Its state decides GST vs IGST.
- **Ownership:** `createdBy` is who uploaded the bill (kept for the record). `ownerId` is who can edit and resubmit it, and it moves when the Admin transfers a workload.
- **Who can edit:** the owner can edit a draft, a rejected bill, or a pending bill nobody has approved yet.

### Roles

| Role | Can |
|---|---|
| `ADMIN` | Create users; change anyone's role, reporting line and default location; transfer a CM/OM/FM workload; see all bills; approve or reject any pending bill on behalf of whoever it waits on; delete any bill not yet posted |
| `FM` | Approve or reject bills waiting on them (approval posts to Zoho); upload bills that post to Zoho straight away |
| `OM`, `CM` | Approve or reject bills waiting on them; upload bills that start at their own manager |
| `PM` | Upload their own bills; see every bill assigned to them, including drafts |

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

| File | What it does |
|---|---|
| `server.js` | Global TLS patch (for MongoDB/Zoho on Render), Express setup, Mongo connect, Zoho contact sync on start, hourly cleanup of unused uploaded files |
| `models.js` | Mongoose models: `FinanceOrg`, `User`, `Bill`, `Contact`, `VendorAccountMap` |
| `mw.js` | `auth(...roles)` checks the JWT and the user's role. `h()` wraps async routes, and `httpError(status, msg)` sends errors to the JSON error handler |
| `hierarchy.js` | Roles, who reports to whom (`MANAGER_ROLE`), and the PMs below a user (`assignablePms`) |
| `routes/auth.js` | Register an organisation (creates its one Admin), log in |
| `routes/admin.js` | Admin only: list, create, update and delete users, and transfer workloads |
| `routes/bills.js` | Bill lifecycle: extract, draft or submit, edit, delete, list (queue, history, mine), view file, approve/reject, post to Zoho |
| `routes/zoho.js` | Zoho data for the UI (accounts, taxes, contacts, locations), cached 5 min per org |
| `zoho.js` | Zoho Books API client: OAuth token per org, contact sync, `createBill`, `attach` |
| `extract.js` | Bill reading: OCR + AI extraction |
| `files.js` | GridFS file storage (save, read, stream, delete, find unused) |
| `gst.js` | GSTIN → state table and the GST vs IGST rule (`taxPlan`) |
| `learn.js` | Learns from uploaders' corrections: extraction log, vendor memory, few-shot examples (`ExtractionLog` collection) |
| `data/extract-store.json` | Extraction cache (by file hash and by GSTIN + invoice number) |

## API

All routes except register and login need `Authorization: Bearer <jwt>`.

**Errors:** every error comes back as `{ error: "message" }` with an HTTP status, and the frontend shows it in a popup. Routes throw `httpError(status, msg)`, and the error handler in `server.js` turns it into JSON.

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
- `POST /`: create a bill from `{ pdfFile, ...fields, location_id, allocations, draft }`.
  - `draft: true` saves it as a DRAFT, which only needs the file and a location.
  - Otherwise it's submitted. That needs the vendor, bill number, date and valid lines, the allocations must add up to within ₹1 of the total, and the bill number must be unique for the vendor.
- `PUT /:id`: the owner edits the bill, with the same body; `draft` decides whether it's resubmitted.
- `DELETE /:id`: the owner or the Admin deletes a bill that isn't POSTED.
- `GET /?scope=`: each bill is returned with `vendorGstin` and `taxInfo`, and with the people on it populated.
  - `queue` (default): bills waiting on me. For the Admin, all pending bills.
  - `history`: everything I can see. For a PM, bills assigned to them or owned by them. For a CM, OM or FM, bills assigned to any PM below them, bills they own, bills waiting on them, or bills they acted on. For the Admin, every bill.
  - `mine`: bills I own.
- `GET /:id/pdf`: the bill's file, if I can see the bill.
- `POST /:id/approve | /:id/reject`: only the approver the bill waits on, or the Admin. Rejecting needs a `comment`. At FM, `lineItems[].tax_id` can override the tax slabs.
- `GET/POST /vendor-account-map`: remembers the uploader's default expense account for each vendor.

**Zoho** (`/api/zoho`):
- `GET /accounts`, `/contacts?search=`: uploaders only.
- `GET /taxes`, `/locations`: any logged-in user. Each location has a resolved `state_code`.
- `POST /sync`: Admin or FM; re-syncs vendor contacts.

## Key logic

### Extraction (`extract.js`)
1. **Cache:** if this exact file was seen before (`EXTRACT_CACHE` on), the saved result is returned.
2. **Text:** the PDF's own text layer is used if it's readable. Otherwise the pages are turned into images and read with Tesseract. Only the first 2 + last 2 pages are read unless `pages=all`.
3. **Regex:** picks out GSTIN, invoice number, date, tax % and total.
4. **AI:** Gemini, DeepSeek and Groq get the text in parallel. The **first usable result wins** and the others aren't waited for. If every AI fails, the regex result is used.
5. **Single line:** the PM form turns all extracted items into one line, with rate = the sum of qty × rate before tax.

### Learning from corrections (`learn.js`)
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

### File storage (`files.js`)
- Files are stored in MongoDB GridFS (bucket `billFiles`), and `Bill.pdfFile` holds the GridFS id. Local disk on Render is wiped on every deploy, which is why files aren't kept there.
- **When files are deleted:**
  - When the owner or the Admin deletes the bill.
  - After the file is attached in Zoho.
  - By the hourly cleanup, if it's over 1 hour old and no bill uses it.
- Draft, pending and rejected bills keep their file.
- **Bill data is never deleted automatically.** Only the file is.

### Tax: GST vs IGST (`gst.js`)
- **Vendor state:** the first 2 digits of the vendor GSTIN. The GSTIN comes from the Zoho contact, or from the extracted data if Zoho has none.
- **Property state:** the `source_of_supply` of the location picked on the bill, which defaults to the uploader's own location. The backend looks the location up in Zoho and takes the state from it: `address.state_code` (e.g. `HR`), else the first 2 digits of the location's GSTIN (`tax_reg_no`), else the state name. It never trusts the request body for the state.
- **The rule:**
  - Same state: GST slab (CGST + SGST).
  - Different states: IGST slab.
  - In both cases the slab is matched to the line's `tax_percentage`.
  - No vendor GSTIN, or 0%: no tax slab.
- At FM approval (or an FM's own upload), slabs are filled in automatically. The FM can override them during approval. Posting is blocked only when the slab can't be worked out.

### Posting to Zoho (`zoho.createBill`)
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
- **History:** `Bill.history[]` records `{ by, byId, role, action, comment, at }`. The actions are DRAFT_SAVED, SUBMITTED, RESUBMITTED, APPROVED, REJECTED and POSTED.
- **Allocations:** used in the app only (history and analytics per property). Zoho gets one bill.

## Environment (`.env`)

| Var | Purpose |
|---|---|
| `MONGO_URI`, `JWT_SECRET`, `PORT` | Core |
| `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY` | AI providers (at least one is required) |
| `GEMINI_MODEL`, `DEEPSEEK_MODEL`, `GROQ_MODEL` | Model overrides |
| `GEMINI_MIN_GAP_MS` | Minimum gap between Gemini calls (default 4500) |
| `EXTRACT_CACHE` | `off` disables the extraction cache |
| `EXTRACT_STORE` | Cache file path (default `./data/extract-store.json`) |
| `DEBUG_OCR` | `true` logs OCR/AI details. A one-line timing summary is always logged. |

Zoho credentials are **not** in `.env`. They're stored for each org in `FinanceOrg` at registration.

## Run

```
npm i
npm start        # node server.js
```
