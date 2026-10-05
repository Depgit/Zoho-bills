import Icon from '../../components/common/Icon.jsx';

// No bills to show: either filters hide everything, or nothing was uploaded yet
export default function EmptyHistory({ filtered, canUpload, onReset, onNewEntry }) {
  return (
    <div className="empty">
      <Icon name="inbox" size={32} strokeWidth={1.5} />
      <h3>{filtered ? 'No bills match these filters' : 'No bills yet'}</h3>
      <p>{filtered ? 'Try removing a filter or widening the date range.' : canUpload ? 'Upload your first vendor invoice to get started.' : 'Nothing has been submitted yet.'}</p>
      {filtered ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
          Clear filters
        </button>
      ) : (
        canUpload && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onNewEntry}>
            Upload a bill
          </button>
        )
      )}
    </div>
  );
}
