import React, { useEffect, useState } from 'react';

// Global error popup. Anything calling showError() (api.js) lands here.
// Several errors in a row are queued and shown one after another.
export default function ErrorModal() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const onError = e => setQueue(q => (q[q.length - 1] === e.detail ? q : [...q, e.detail]));
    window.addEventListener('app-error', onError);
    return () => window.removeEventListener('app-error', onError);
  }, []);

  const close = () => setQueue(q => q.slice(1));

  useEffect(() => {
    if (!queue.length) return;
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue.length]);

  if (!queue.length) return null;
  return (
    <div className="history-modal-backdrop" style={{ zIndex: 2000 }} onClick={close}>
      <div className="history-modal-content" role="alertdialog" aria-modal="true" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="history-modal-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger-text, #dc2626)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Something needs your attention</h3>
        </div>
        <div className="history-modal-body" style={{ fontSize: '0.9375rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {queue[0]}
        </div>
        <div className="history-modal-footer">
          {queue.length > 1 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: 'auto' }}>{queue.length - 1} more</span>}
          <button type="button" className="btn btn-primary btn-sm" autoFocus onClick={close}>OK</button>
        </div>
      </div>
    </div>
  );
}
