// Entry point: TLS patch → database (migrations) → background jobs → HTTP server
import { PORT } from './config/env.js';
import { checkEncryptionKey } from './security/secrets.js';
import { applyTlsPatch } from './config/tls.js';
import { connectDb, runMigrations } from './db/index.js';
import { createApp } from './http/app.js';
import { startCleanupJobs } from './jobs/cleanup.js';
import { syncAllContacts } from './jobs/syncContacts.js';

checkEncryptionKey(); // stop now if the key for the stored Zoho credentials is missing
applyTlsPatch();
await connectDb();
await runMigrations();
startCleanupJobs();
const app = createApp();
app.listen(PORT, () => console.log(`API up on port ${PORT}`));
syncAllContacts(); // in the background — logs its own errors
