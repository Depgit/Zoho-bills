import { useState } from 'react';
import SearchSelect from '../../components/common/SearchSelect.jsx';

// Pick another user of the same role and move this user's whole workload to them
export default function TransferControl({ user, peers, onTransfer }) {
  const [target, setTarget] = useState('');
  return (
    <div style={{ display: 'flex', gap: '0.3rem' }}>
      <SearchSelect value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem' }}>
        <option value="">To {user.role}…</option>
        {peers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SearchSelect>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onTransfer(user, target)}
        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
      >
        Move all
      </button>
    </div>
  );
}
