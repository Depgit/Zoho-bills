// The database layer. Everything outside src/db talks to the database only through these.
//   connectDb / dbState / closeDb / runMigrations — connection & schema
//   repositories — one per kind of data; they take and return plain objects, never SQL
export { connectDb, dbState, closeDb } from './client.js';
export { runMigrations } from './migrate.js';
export * as usersRepo from './repositories/users.repo.js';
export * as orgsRepo from './repositories/orgs.repo.js';
export * as billsRepo from './repositories/bills/index.js';
export * as filesRepo from './repositories/files.repo.js';
export * as contactsRepo from './repositories/contacts.repo.js';
export * as vendorAccountsRepo from './repositories/vendorAccounts.repo.js';
export * as extractionLogsRepo from './repositories/extractionLogs.repo.js';
export * as extractionCacheRepo from './repositories/extractionCache.repo.js';
export * as transfersRepo from './repositories/transfers.repo.js';
