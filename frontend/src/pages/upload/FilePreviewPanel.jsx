import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import Icon from '../../components/common/Icon.jsx';

// The uploaded bill next to the form, so the details can be checked against it
export default function FilePreviewPanel({ preview, loading }) {
  return (
    <aside className="file-preview">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="file" size={16} /> Uploaded file
        </span>
        {preview?.url && (
          <a className="btn btn-ghost btn-sm" href={preview.url} target="_blank" rel="noreferrer">
            Open <Icon name="external" size={13} />
          </a>
        )}
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
