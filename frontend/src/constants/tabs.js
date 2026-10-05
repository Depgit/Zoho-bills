// Tabs per role: [key, label]. Approvers (CM/OM/FM) also upload; Admin manages users and all bills.
export const TABS = {
  PM: [
    ['upload', 'Upload bill'],
    ['history', 'History'],
  ],
  CM: [
    ['queue', 'Approvals'],
    ['upload', 'Upload bill'],
    ['history', 'History'],
  ],
  OM: [
    ['queue', 'Approvals'],
    ['upload', 'Upload bill'],
    ['history', 'History'],
  ],
  FM: [
    ['queue', 'Approvals'],
    ['upload', 'Upload bill (direct to Zoho)'],
    ['history', 'History'],
  ],
  ADMIN: [
    ['users', 'Users & hierarchy'],
    ['queue', 'All pending'],
    ['history', 'All bills'],
  ],
};
