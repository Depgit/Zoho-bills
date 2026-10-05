// npm run secrets:encrypt — encrypt Zoho credentials still stored as plain text (safe to run again)
import { closeDb } from '../src/db/client.js';
import { orgsRepo } from '../src/db/index.js';
import { checkEncryptionKey } from '../src/security/secrets.js';

checkEncryptionKey();
console.log(`Encrypted the Zoho credentials of ${await orgsRepo.encryptStoredSecrets()} organisation(s)`);
await closeDb();
