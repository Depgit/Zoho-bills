// ₹1,23,456.00
export const inr = (n) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');
