// drizzle-kit: `npm run db:generate` writes SQL migrations from src/db/schema
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.js',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL },
});
