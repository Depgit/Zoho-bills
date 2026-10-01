# Zoho Bill Approvals (MERN)

Flow: PM uploads PDF -> extract -> PM picks vendor/account/tax -> L1 approve -> Finance approve -> bill posted to Zoho Books
(+ PDF attached) -> local PDF deleted. Rejected bills keep the PDF so the PM can fix and resubmit.

## Run
    cd backend && cp .env.example .env   # fill values
    npm i && npm run seed && npm start
    cd ../frontend && npm i && npm run dev   # http://localhost:5173
Seed users (password123): pm@example.com, l1@example.com, fin@example.com

## Zoho setup (India DC)
1. https://api-console.zoho.in -> Self Client. Scopes:
   ZohoBooks.bills.CREATE,ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.settings.READ,ZohoBooks.accountants.READ
2. Generate code -> exchange at https://accounts.zoho.in/oauth/v2/token (grant_type=authorization_code) -> copy refresh_token to .env.
3. ZOHO_ORG_ID from Zoho Books -> Settings -> Organization Profile.
