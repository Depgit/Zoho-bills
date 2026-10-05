import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { lineTax, lineTotal } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';

// One bill line: description, name, qty, rate, expense account, tax %, and its amount (qty × rate + tax)
export default function LineItemRow({ line, accounts, taxRates, onChange, onRemove }) {
  return (
    <div className="line-item-row">
      <input
        className="form-control"
        placeholder="Detailed description"
        title={line.description || ''}
        value={line.description || ''}
        onChange={(e) => onChange('description', e.target.value)}
      />
      <input className="form-control" placeholder="Item / service name" title={line.name || ''} value={line.name} onChange={(e) => onChange('name', e.target.value)} />
      <input type="number" min="1" className="form-control" value={line.quantity} onChange={(e) => onChange('quantity', +e.target.value)} />
      <input
        type="number"
        step="0.01"
        min="0"
        className="form-control"
        style={!(Number(line.rate) > 0) ? { borderColor: '#ef4444' } : {}}
        placeholder="Rate ₹ *"
        value={line.rate === '' ? '' : line.rate}
        onChange={(e) => onChange('rate', e.target.value === '' ? '' : +e.target.value)}
      />
      <SearchSelect value={line.account_id} onChange={(e) => onChange('account_id', e.target.value)}>
        <option value="">— Account —</option>
        {accounts.map((a) => (
          <option key={a.account_id} value={a.account_id}>
            {a.account_name}
          </option>
        ))}
      </SearchSelect>
      <SearchSelect value={line.tax_percentage ?? 0} onChange={(e) => onChange('tax_percentage', Number(e.target.value))}>
        {taxRates.map((r) => (
          <option key={r} value={r}>
            {r}%
          </option>
        ))}
      </SearchSelect>
      <div className="line-amount" title="Qty × rate + tax">
        <b>{inr(lineTotal(line))}</b>
        {lineTax(line) > 0 && <span>incl. {inr(lineTax(line))} tax</span>}
      </div>
      <button type="button" className="btn-icon-danger" title="Remove line" onClick={onRemove}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
