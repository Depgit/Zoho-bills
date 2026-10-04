# Backend — Zoho Bill Approvals

Node + Express + MongoDB (Mongoose). Property Managers upload vendor bills, an AI
extracts the fields, L1 and Finance approve, and the bill is posted to Zoho Books
with the file attached.

## Workflow

```
PM uploads file ──► /bills/extract ──► OCR + AI ──► form pre-filled
                                       file saved in GridFS
PM submits      ──► POST /bills                 status PENDING_L1
L1 approve      ──► POST /bills/:id/approve     status PENDING_FINANCE
Finance approve ──► POST /bills/:id/approve     tax slab auto-picked
                                                → bill created in Zoho
                                                → file attached in Zoho, deleted from GridFS
                                                status POSTED
Either rejects  ──► POST /bills/:id/reject      status REJECTED_L1 / REJECTED_FINANCE
                                                (file kept so the PM can fix it)
PM edits        ──► PUT /bills/:id              back to PENDING_L1 (can swap the file)
```

### Roles

| Role | Who | Can |
|---|---|---|
| `FINANCE` | Registers with Zoho credentials; owns one **FinanceOrg** | Approve or reject PENDING_FINANCE bills, manage PM/L1 users, sync Zoho contacts |
| `L1` | Created by Finance | Approve or reject PENDING_L1 bills |
| `PM` | Property Manager, created by Finance with a **state** and **location** | Upload, submit, edit, resubmit and delete their own bills |

Every user and bill belongs to one FinanceOrg (`financeOrgId`), and all queries are
scoped to it. Each FinanceOrg has its own Zoho credentials.

## Files

| File | What it does |
|---|---|
| `server.js` | Global TLS patch (for MongoDB/Zoho on Render), Express setup, Mongo connect, Zoho contact sync on start, hourly cleanup of unused uploaded files |
| `models.js` | Mongoose models: `FinanceOrg`, `User`, `Bill`, `Contact`, `VendorAccountMap` |
| `mw.js` | `auth(...roles)`: checks the JWT and the user's role |
| `routes/auth.js` | Register Finance, log in, list/create/delete users |
| `routes/bills.js` | Bill lifecycle: extract, submit, edit, delete, list, view file, approve/reject |
| `routes/zoho.js` | Zoho data for the UI (accounts, taxes, contacts, locations), cached 5 min per org |
| `zoho.js` | Zoho Books API client: OAuth token per org, contact sync, `createBill`, `attach` |
| `extract.js` | Bill reading: OCR + AI extraction |
| `files.js` | GridFS file storage (save, read, stream, delete, find unused) |
| `gst.js` | GSTIN → state table and the GST vs IGST rule (`taxPlan`) |
| `learn.js` | Learns from PM corrections: extraction log, vendor memory, few-shot examples (`ExtractionLog` collection) |
| `data/extract-store.json` | Extraction cache (by file hash and by GSTIN + invoice number) |

## API

All routes except register and login need `Authorization: Bearer <jwt>`.

**Auth** (`/api/auth`)
- `POST /register-finance`: create a Finance user and FinanceOrg (checks the Zoho credentials)
- `POST /login`: returns `{ token, user }`. The JWT holds `id, name, role, financeOrgId` and lasts 12h.
- `GET /users`, `POST /users`, `DELETE /users/:id` (FINANCE): manage the org's PM and L1 users

**Bills** (`/api/bills`)
- `POST /extract` (PM): multipart `file` (PDF or image, max 10 MB), optional `pages=all`. Returns `{ pdfFile, fileType, extracted, extractMeta }`.
- `POST /` (PM): submit a bill. Needs a valid `pdfFile`, vendor, bill number, date, and line items each with an account, rate > 0 and qty > 0. A duplicate vendor + bill number returns 409.
- `PUT /:id` (PM): edit a PENDING_L1 or rejected bill; sets it back to PENDING_L1. A new `pdfFile` replaces the old one.
- `DELETE /:id` (PM): delete a bill that isn't POSTED.
- `GET /`:
  - PM: their own bills.
  - L1/Finance: their queue.
  - L1/Finance with `?scope=history`: every bill in the org.
  - Each bill comes back with `vendorGstin` and `taxInfo`.
- `GET /:id/pdf`: stream the bill's file from GridFS.
- `POST /:id/approve | /:id/reject` (L1, FINANCE): rejecting needs a `comment`. When Finance approves, the bill is posted to Zoho.
- `GET/POST /vendor-account-map` (PM): remembers the PM's default expense account for each vendor.

**Zoho** (`/api/zoho`): `GET /accounts`, `/taxes`, `/contacts?search=`, `/locations`, and `POST /sync` (re-sync vendor contacts).

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
  - When the PM deletes the bill.
  - After the file is attached in Zoho.
  - By the hourly cleanup, if it's over 1 hour old and no bill uses it.
- Rejected and pending bills keep their file.
- **Bill data is never deleted automatically.** Only the file is.

### Tax: GST vs IGST (`gst.js`)
- **Vendor state:** the first 2 digits of the vendor GSTIN. The GSTIN comes from the Zoho contact, or from the extracted data if Zoho has none.
- **Property state:** the PM's `source_of_supply`, set by the admin. `DL`, `07` and `Delhi` all work.
- **The rule:**
  - Same state: GST slab (CGST + SGST).
  - Different states: IGST slab.
  - In both cases the slab is matched to the line's `tax_percentage`.
  - No vendor GSTIN, or 0%: no tax slab.
- When Finance approves, slabs are filled in automatically. Finance can override them. Approval is blocked only when the slab can't be worked out.

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

`PENDING_L1 → PENDING_FINANCE → POSTED`, or `REJECTED_L1` / `REJECTED_FINANCE`. A rejected bill goes back to `PENDING_L1` when the PM edits it.
`Bill.history[]` records every action as `{ by, action, comment, at }`. The actions are SUBMITTED, EDITED, RESUBMITTED, APPROVED and REJECTED.

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
