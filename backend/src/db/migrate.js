// Apply pending SQL migrations from src/db/migrations (run on start-up and by `npm run db:migrate`)
import path from 'path';
import { fileURLToPath } from 'url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export const runMigrations = () => migrate(db, { migrationsFolder });
