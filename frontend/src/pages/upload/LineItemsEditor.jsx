import { BLANK_LINE } from './billForm.js';
import DiscountRow from './DiscountRow.jsx';
import LineItemRow from './LineItemRow.jsx';

// Bill lines + discount. The first expense account picked on a bill is copied to the other
// lines that were empty or had the same auto-filled account; later picks change only that line.
export default function LineItemsEditor({ form, setForm, set, accounts, taxRates, discount, onAccountPicked }) {
  const lines = form.lineItems;

  const changeLine = (i, key, value) => {
    let updated = lines.map((l, j) => (j === i ? { ...l, [key]: value } : l));
    const firstAccountPick = key === 'account_id' && value && !form.accountPicked;
    if (firstAccountPick) {
      const previous = lines[i].account_id;
      updated = updated.map((l, j) => (j !== i && (!l.account_id || l.account_id === previous) ? { ...l, account_id: value } : l));
    }
    setForm((prev) => ({ ...prev, lineItems: updated, ...(firstAccountPick && { accountPicked: true }) }));
    if (key === 'account_id' && value) onAccountPicked(value);
  };

  // New line starts with the account already used on this bill
  const addLine = () => set('lineItems', [...lines, { ...BLANK_LINE, account_id: lines.find((l) => l.account_id)?.account_id || '' }]);
  const removeLine = (i) => set('lineItems', lines.length > 1 ? lines.filter((_, j) => j !== i) : [BLANK_LINE]);

  return (
    <div className="form-field" style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <label className="form-label" style={{ fontSize: '0.875rem' }}>
          Bill Line Items &amp; Tax Breakdown
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
          + Add Item
        </button>
      </div>

      <div className="line-items-container">
        <div className="line-item-header">
          <div>Description</div>
          <div>Item Name</div>
          <div>Qty</div>
          <div>Rate (₹)</div>
          <div>Expense Account</div>
          <div>Tax %</div>
          <div className="num">Amount</div>
          <div></div>
        </div>
        {lines.map((line, i) => (
          <LineItemRow
            key={i}
            line={line}
            accounts={accounts}
            taxRates={taxRates}
            onChange={(key, value) => changeLine(i, key, value)}
            onRemove={() => removeLine(i)}
          />
        ))}
      </div>

      <DiscountRow form={form} set={set} discount={discount} />
    </div>
  );
}
