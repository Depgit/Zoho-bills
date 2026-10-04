import Icon from './Icon.jsx';

export default function RefreshButton({ onClick, loading, label = 'Refresh' }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick} disabled={loading}>
      <Icon name="refresh" size={15} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Refreshing…' : label}
    </button>
  );
}
