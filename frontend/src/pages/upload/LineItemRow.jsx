import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';

export const LINE_COLUMNS = '1.4fr 1.2fr 0.6fr 0.8fr 1.3fr 1fr 36px';

// One bill line: description, name, qty, rate, expense account, tax %
export default function LineItemRow({ line, accounts, taxRates, onChange, onRemove }) {
  return (
    <div className="line-item-row" style={{ gridTemplateColumns: LINE_COLUMNS }}>
      <input
        className="form-control"
        placeholder="Detailed description"
        value={line.description || ''}
        onChange={(e) => onChange('description', e.target.value)}
      />
      <input className="form-control" placeholder="Item / service name" value={line.name} onChange={(e) => onChange('name', e.target.value)} />
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
      <button type="button" className="btn-icon-danger" title="Remove line" onClick={onRemove}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
