import Icon from './Icon.jsx';

// The bill's file: image or PDF, or a fallback message when there's none (e.g. already posted)
export default function DocumentPreview({ url, type, height = 500, fallback }) {
  if (!url) {
    return (
      <div className="pdf-preview-box">
        <div className="pdf-fallback" style={{ padding: '2rem' }}>
          <Icon name="file" size={40} strokeWidth={1.5} style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }} />
          <p>{fallback || 'Document preview unavailable or already posted'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pdf-preview-box">
      {type?.startsWith('image/') ? (
        <div
          style={{
            textAlign: 'center',
            padding: '1rem',
            background: '#0f172a',
            borderRadius: 'var(--radius-md)',
            overflow: 'auto',
            maxHeight: height,
          }}
        >
          <img src={url} alt="Invoice Document" style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }} />
        </div>
      ) : (
        <iframe src={url} title="invoice-document" style={{ height }} />
      )}
    </div>
  );
}
