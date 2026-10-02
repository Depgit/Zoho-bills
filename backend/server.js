import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import auth from './routes/auth.js';
import zohoRoutes from './routes/zoho.js';
import bills from './routes/bills.js';
import { Bill, FinanceOrg } from './models.js';
import { fullSync } from './zoho.js';
fs.mkdirSync('uploads', { recursive: true });
const app = express();
app.use(cors()); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/zoho', zohoRoutes); app.use('/api/bills', bills);
// remove uploads that were never submitted as a bill (older than 1 day)
setInterval(async () => {
  for (const f of fs.readdirSync('uploads')) {
    const p = 'uploads/' + f;
    if (Date.now() - fs.statSync(p).mtimeMs > 864e5 && !(await Bill.exists({ pdfFile: f }))) fs.rmSync(p, { force: true });
  }
}, 36e5);
await mongoose.connect(process.env.MONGO_URI);
// Sync Zoho contacts for every registered Finance Org
const orgs = await FinanceOrg.find({});
if (orgs.length === 0) {
  console.log('No Finance Orgs registered yet — skipping contact sync');
} else {
  console.log(`Syncing Zoho contacts for ${orgs.length} Finance Org(s)...`);
  await Promise.all(orgs.map(org =>
    fullSync(org).catch(e => console.error(`Contacts sync failed for org ${org.zohoOrgId}:`, e.message))
  ));
  console.log('Contacts synced');
}
app.listen(process.env.PORT || 5000, () => console.log('API up'));
