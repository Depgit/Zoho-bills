import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';

const readPagesPref = () => {
  try {
    return localStorage.getItem('pdfPages') === 'all' ? 'all' : 'trim';
  } catch {
    return 'trim';
  }
};

// File drop zone + "PDF pages" choice (first 2 + last 2, or all). Calls onFile(file, pages).
export default function UploadCard({ extracting, onFile }) {
  const [pages, setPages] = useState(readPagesPref);
  const choosePages = (value) => {
    setPages(value);
    try {
      localStorage.setItem('pdfPages', value);
    } catch {
      /* ignore */
    }
  };

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file (e.g. to compare page modes)
    if (file) onFile(file, pages);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <Icon name="upload" size={20} style={{ color: 'var(--primary)' }} />
          Upload Vendor Invoice (PDF / Image)
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginLeft: 'auto', marginRight: '0.75rem' }}>
          PDF pages
          <SearchSelect
            style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
            value={pages}
            onChange={(e) => choosePages(e.target.value)}
            disabled={extracting}
          >
            <option value="trim">First 2 + last 2</option>
            <option value="all">All pages</option>
          </SearchSelect>
        </label>
        {extracting && (
          <div className="loading-indicator" style={{ margin: 0, padding: '0.35rem 0.75rem' }}>
            <div className="spinner"></div>
            <span>Processing with AI OCR...</span>
          </div>
        )}
      </div>

      <div className="upload-dropzone">
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp" onChange={pick} disabled={extracting} />
        <div className="upload-icon-circle">
          <Icon name="fileUpload" size={24} />
        </div>
        <div>
          <p className="upload-text-main">Click or drag bill (PDF, JPG, PNG, WEBP) to upload and auto-extract</p>
          <p className="upload-text-sub">Supports PDF documents and invoice photos/scans</p>
        </div>
      </div>
    </div>
  );
}
