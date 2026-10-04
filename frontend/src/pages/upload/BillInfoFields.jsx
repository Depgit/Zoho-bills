// Bill number, invoice date, due date
export default function BillInfoFields({ form, set }) {
  return (
    <div className="form-grid-3">
      <div className="form-field">
        <label className="form-label">Bill / Invoice Number *</label>
        <input className="form-control" placeholder="INV-2024-001" value={form.billNumber} onChange={(e) => set('billNumber', e.target.value)} />
      </div>
      <div className="form-field">
        <label className="form-label">Invoice Date *</label>
        <input type="date" className="form-control" value={form.date} onChange={(e) => set('date', e.target.value)} />
      </div>
      <div className="form-field">
        <label className="form-label">Due Date</label>
        <input type="date" className="form-control" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
      </div>
    </div>
  );
}
