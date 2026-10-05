import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import Icon from '../../components/common/Icon.jsx';

// The uploaded bill next to the form, so the details can be checked against it.
// It can be hidden to give the form the full width (a slim bar brings it back).
export default function FilePreviewPanel({ preview, loading, hidden, onToggle }) {
  if (hidden) {
    return (
      <button type="button" className="file-preview-tab" onClick={onToggle} title="Show the uploaded file">
        <Icon name="file" size={16} />
        <span>Show file</span>
      </button>
    );
  }
  return (
    <aside className="file-preview">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="file" size={16} /> Uploaded file
        </span>
        <span className="page-actions">
          {preview?.url && (
            <a className="btn btn-ghost btn-sm" href={preview.url} target="_blank" rel="noreferrer">
              Open <Icon name="external" size={13} />
            </a>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} title="Hide the file to give the form more room">
            Hide
          </button>
        </span>
      </div>
      {preview?.name && <div className="file-preview-name truncate">{preview.name}</div>}
      <DocumentPreview
        url={preview?.url}
        type={preview?.type}
        height="calc(100vh - 190px)"
        fallback={loading ? 'Loading the file…' : 'No file attached — upload it above.'}
      />
    </aside>
  );
}
