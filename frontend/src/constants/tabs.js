// Tabs per role: [key, label]. Approvers (CM/OM/FM) also upload; Admin manages users and all bills.
export const TABS = {
  PM: [
    ['upload', '📤 Upload Bill'],
    ['history', '📜 Invoice History'],
  ],
  CM: [
    ['queue', '📋 Approval Queue'],
    ['upload', '📤 Upload Bill'],
    ['history', '📜 Invoice History'],
  ],
  OM: [
    ['queue', '📋 Approval Queue'],
    ['upload', '📤 Upload Bill'],
    ['history', '📜 Invoice History'],
  ],
  FM: [
    ['queue', '📋 Approval Queue'],
    ['upload', '📤 Upload Bill (direct to Zoho)'],
    ['history', '📜 Invoice History'],
  ],
  ADMIN: [
    ['users', '👥 Users & Hierarchy'],
    ['queue', '⏳ All Pending'],
    ['history', '📜 All Bills'],
  ],
};
