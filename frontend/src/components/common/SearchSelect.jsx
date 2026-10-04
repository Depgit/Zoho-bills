import React, { useEffect, useMemo, useRef, useState } from 'react';

// Searchable drop-in replacement for <select>.
// Use it exactly like a select: same <option>/<optgroup> children, `value`, and
// `onChange(e)` where e.target.value is the picked value. Typing filters the list.
// The list is position:fixed so it isn't clipped inside scrolling tables.

function toOptions(children, group = '') {
  const out = [];
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    if (c.type === 'optgroup') out.push(...toOptions(c.props.children, c.props.label));
    else if (c.type === 'option') {
      const label = React.Children.toArray(c.props.children).join('');
      out.push({ value: String(c.props.value ?? label), label, group, disabled: !!c.props.disabled });
    } else if (c.type === React.Fragment) out.push(...toOptions(c.props.children, group));
  });
  return out;
}

export default function SearchSelect({ value, onChange, children, className = 'form-control', style, disabled, required, placeholder }) {
  const options = useMemo(() => toOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const current = options.find(o => o.value === String(value ?? ''));
  // An option with value "" is the select's placeholder ("— Select … —")
  const emptyLabel = options.find(o => o.value === '')?.label || placeholder || 'Select…';
  const q = query.trim().toLowerCase();
  const shown = options.filter(o => !o.disabled && (!q || o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q)));

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const height = Math.min(320, Math.max(below, r.top) - 12);
    setPos({ left: r.left, width: Math.max(r.width, 200), ...(below >= 220 || below >= r.top ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }), maxHeight: height });
  };

  const openList = () => {
    if (disabled) return;
    place();
    setQuery('');
    setActive(Math.max(0, options.filter(o => !o.disabled).findIndex(o => o.value === String(value ?? ''))));
    setOpen(true);
  };

  const pick = (o) => {
    setOpen(false);
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } });
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false);
    };
    const reposition = (e) => { if (!listRef.current?.contains(e.target)) place(); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // keep the highlighted row in view
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
  };

  let lastGroup = null;
  return (
    <div style={{ position: 'relative', ...(style?.flex ? { flex: style.flex } : {}), ...(style?.width ? { width: style.width } : {}), ...(style?.maxWidth ? { maxWidth: style.maxWidth } : {}), ...(style?.minWidth ? { minWidth: style.minWidth } : {}) }}>
      <button
        type="button"
        ref={btnRef}
        className={className}
        style={{ ...style, width: '100%', flex: undefined, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openList(); } }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: current && current.value !== '' ? undefined : 'var(--text-muted)' }}>
          {current ? current.label : emptyLabel}
        </span>
        <span aria-hidden style={{ fontSize: '0.7em', opacity: 0.6 }}>▾</span>
      </button>
      {/* keeps native "required" form validation working */}
      {required && (
        <input tabIndex={-1} required value={value ?? ''} onChange={() => { }} onFocus={openList}
          style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, opacity: 0, pointerEvents: 'none' }} />
      )}
      {open && pos && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight,
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))', overflow: 'hidden',
          }}
        >
          <input
            ref={inputRef}
            className="form-control"
            placeholder="Search…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKey}
            style={{ border: 'none', borderBottom: '1px solid var(--color-border)', borderRadius: 0, boxShadow: 'none', fontSize: '0.875rem' }}
          />
          <div style={{ overflowY: 'auto' }}>
            {shown.length === 0 && (
              <div style={{ padding: '0.6rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No matches</div>
            )}
            {shown.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <React.Fragment key={o.group + '|' + o.value}>
                  {header && (
                    <div style={{ padding: '0.4rem 0.75rem 0.2rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{header}</div>
                  )}
                  <div
                    data-i={i}
                    role="option"
                    aria-selected={o.value === String(value ?? '')}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                    style={{
                      padding: '0.45rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer',
                      background: i === active ? 'var(--primary-glow, rgba(99,102,241,0.12))' : 'transparent',
                      fontWeight: o.value === String(value ?? '') ? 700 : 400,
                      color: o.value === '' ? 'var(--text-muted)' : 'var(--text-main)',
                    }}
                  >
                    {o.label}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
