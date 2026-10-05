// Uploaded bill files. The bytes live in file storage (src/storage); this row is the reference.
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull().unique(),
  filename: text('filename').notNull().default(''),
  mimeType: text('mime_type').notNull().default('application/pdf'),
  size: integer('size').notNull().default(0),
  createdAt: createdAt(),
});
