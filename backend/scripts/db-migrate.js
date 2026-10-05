// npm run db:migrate — apply pending migrations and exit
import { runMigrations } from '../src/db/migrate.js';
import { closeDb } from '../src/db/client.js';

await runMigrations();
console.log('Migrations applied');
await closeDb();
