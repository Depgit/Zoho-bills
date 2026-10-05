// Column helpers shared by every table
import { numeric, timestamp } from 'drizzle-orm/pg-core';

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Money / quantities: exact decimals in the DB, plain numbers in JS
export const money = (name) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
export const decimal = (name) => numeric(name, { precision: 14, scale: 4, mode: 'number' });
