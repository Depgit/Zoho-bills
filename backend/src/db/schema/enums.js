import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['PM', 'CM', 'OM', 'FM', 'ADMIN']);
export const billStatus = pgEnum('bill_status', ['DRAFT', 'PENDING', 'REJECTED', 'POSTED']);
