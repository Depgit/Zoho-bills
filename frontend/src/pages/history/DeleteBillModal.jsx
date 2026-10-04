import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';

// "Delete Bill #X?" confirmation. onConfirm returns a promise.
export default function DeleteBillModal({ bill, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const confirm = async () => {
    setDeleting(true);
    await onConfirm(bill);
    setDeleting(false);
  };

  return (
    <Modal onClose={() => !deleting && onCancel()} maxWidth="480px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--danger-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--danger)',
            flexShrink: 0,
          }}
        >
          <Icon name="trashLines" size={22} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Delete Bill #{bill.billNumber}?</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Vendor: {bill.vendorName}</span>
        </div>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        Are you sure you want to permanently delete this bill? The uploaded invoice file will be removed from the server.
        {bill.status === 'REJECTED' && ' You will then be able to make a clean, fresh entry.'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={deleting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-outline-danger btn-sm"
          onClick={confirm}
          disabled={deleting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {deleting ? (
            <>
              <Spinner size={14} style={{ borderColor: 'rgba(225,29,72,0.2)', borderTopColor: 'var(--danger)' }} />
              Deleting...
            </>
          ) : (
            'Yes, Delete Bill'
          )}
        </button>
      </div>
    </Modal>
  );
}
