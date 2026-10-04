// Entry point: TLS patch → MongoDB → background jobs → HTTP server
import { PORT } from './config/env.js';
import { applyTlsPatch } from './config/tls.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { startOrphanFileCleanup } from './jobs/cleanupOrphanFiles.js';
import { syncAllContacts } from './jobs/syncContacts.js';

applyTlsPatch();
const app = createApp();
startOrphanFileCleanup();
await connectDb();
await syncAllContacts();
app.listen(PORT, () => console.log(`API up on port ${PORT}`));
