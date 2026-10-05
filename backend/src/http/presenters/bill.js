// Bill → API JSON (internal fields left out)
// eslint-disable-next-line no-unused-vars
export const presentBill = ({ financeOrgId, ...bill }) => bill;

export const presentBills = (bills) => bills.map(presentBill);
