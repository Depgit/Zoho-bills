import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Pick several options from a searchable checklist, with "Select all" / "Clear".
//   options: [{ value, label, sub? }]   value: array of selected values   onChange(newArray)
export default function MultiSelect({ options, value = [], onChange, placeholder = 'Choose…', disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef(null);
  const selected = new Set(value);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => !q || `${o.label} ${o.sub || ''}`.toLowerCase().includes(q));
  const allShownSelected = shown.length > 0 && shown.every((o) => selected.has(o.value));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Keep the options' order in the result
  const emit = (set) => onChange(options.map((o) => o.value).filter((v) => set.has(v)));
  const toggle = (v) => {
    const next = new Set(selected);
    if (!next.delete(v)) next.add(v);
    emit(next);
  };
  const toggleShown = () => {
    const next = new Set(selected);
    shown.forEach((o) => (allShownSelected ? next.delete(o.value) : next.add(o.value)));
    emit(next);
  };

  const summary = !value.length
    ? placeholder
    : value.length === options.length
      ? `All ${options.length} selected`
      : value.length <= 2
        ? options.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ')
        : `${value.length} of ${options.length} selected`;

  return (
    <div className="multi" ref={box}>
      <button type="button" className="form-control multi-toggle" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
        <span className={value.length ? '' : 'muted'}>{summary}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="multi-panel" role="listbox" aria-multiselectable="true">
          <div className="multi-search search">
            <Icon name="search" size={14} />
            <input className="input" autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="multi-actions">
            <button type="button" className="link" onClick={toggleShown} disabled={!shown.length}>
              {allShownSelected ? 'Unselect' : 'Select'} all{q ? ' shown' : ''}
            </button>
            {value.length > 0 && (
              <button type="button" className="link" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
          <div className="multi-list">
            {shown.length === 0 && <div className="empty empty-sm">Nothing matches</div>}
            {shown.map((o) => (
              <label key={o.value} className={`multi-option ${selected.has(o.value) ? 'on' : ''}`}>
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                <span>
                  {o.label}
                  {o.sub && <span className="muted"> · {o.sub}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
