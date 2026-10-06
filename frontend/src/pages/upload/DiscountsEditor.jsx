import { useEffect } from 'react';
import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { defaultDiscountAccount, discountAmount } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';

// Discount rows, listed like the bill lines: each a flat ₹ amount or a % of the subtotal, booked to an
// expense account (default "Purchase Discount"). All are taken off the total after tax. Zoho gets their sum
// on ONE account (the first row's); the rows go into the bill's notes.
export default function DiscountsEditor({ rows = [], subtotal, accounts = [], onChange }) {
  const fallbackAccount = defaultDiscountAccount(accounts);
  const change = (i, key, value) => onChange(rows.map((d, j) => (j === i ? { ...d, [key]: value } : d)));
  const add = () => onChange([...rows, { description: '', type: 'amount', value: '', account_id: rows[0]?.account_id || fallbackAccount }]);

  // Rows without an account (read from the PDF, older bills) get Purchase Discount once the accounts load
  useEffect(() => {
    if (fallbackAccount && rows.some((d) => !d.account_id)) onChange(rows.map((d) => (d.account_id ? d : { ...d, account_id: fallbackAccount })));
  }, [fallbackAccount, rows.length]);
  const accountsUsed = new Set(rows.map((d) => d.account_id).filter(Boolean));
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const total = rows.reduce((s, d) => s + discountAmount(d, subtotal), 0);

  return (
    <div className="discounts">
      <div className="discounts-head">
        <span className="form-label">
          <Icon name="tag" size={14} /> Discounts &amp; deductions{' '}
          <span className="muted">(taken off the total after tax)</span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={add}>
          + Add discount
        </button>
      </div>

      {rows.length > 0 && (
        <div className="line-items-container">
          <div className="discount-row discount-header">
            <div>Description</div>
            <div>Type</div>
            <div>Value</div>
            <div>Account</div>
            <div className="num">Amount</div>
            <div />
          </div>
          {rows.map((d, i) => (
            <div key={i} className="discount-row">
              <input
                className="form-control"
                placeholder="e.g. Amount withheld, early-payment discount"
                title={d.description || ''}
                value={d.description || ''}
                onChange={(e) => change(i, 'description', e.target.value)}
              />
              <select className="form-control" value={d.type} onChange={(e) => change(i, 'type', e.target.value)}>
                <option value="amount">₹ flat</option>
                <option value="percent">% of subtotal</option>
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                placeholder={d.type === 'percent' ? '% off' : '₹ amount'}
                value={d.value ?? ''}
                onChange={(e) => change(i, 'value', e.target.value === '' ? '' : +e.target.value)}
              />
              <SearchSelect value={d.account_id || ''} onChange={(e) => change(i, 'account_id', e.target.value)}>
                <option value="">— Account —</option>
                {accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.account_name}
                  </option>
                ))}
              </SearchSelect>
              <div className="line-amount discount-amount">
                <b>− {inr(discountAmount(d, subtotal))}</b>
              </div>
              <button type="button" className="btn-icon-danger" title="Remove discount" onClick={() => remove(i)}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
          {rows.length > 1 && (
            <div className="discount-row discount-total">
              <div>Total discounts</div>
              <div />
              <div />
              <div />
              <div className="line-amount discount-amount">
                <b>− {inr(total)}</b>
              </div>
              <div />
            </div>
          )}
        </div>
      )}
      {accountsUsed.size > 1 && (
        <p className="alloc-hint text-danger">Zoho books a bill's discount to one account — the first row's account will be used for all of them.</p>
      )}
    </div>
  );
}
