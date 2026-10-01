import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import auth from './routes/auth.js';
import zoho from './routes/zoho.js';
import bills from './routes/bills.js';
import { Bill } from './models.js';
fs.mkdirSync('uploads', { recursive: true });
const app = express();
app.use(cors()); app.use(express.json());
app.use('/api/auth', auth); app.use('/api/zoho', zoho); app.use('/api/bills', bills);
// remove uploads that were never submitted as a bill (older than 1 day)
setInterval(async () => {
  for (const f of fs.readdirSync('uploads')) {
    const p = 'uploads/' + f;
    if (Date.now() - fs.statSync(p).mtimeMs > 864e5 && !(await Bill.exists({ pdfFile: f }))) fs.rmSync(p, { force: true });
  }
}, 36e5);
await mongoose.connect(process.env.MONGO_URI);
app.listen(process.env.PORT || 5000, () => console.log('API up'));
