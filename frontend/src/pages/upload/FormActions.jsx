import Icon from '../../components/common/Icon.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { MANAGER_ROLE } from '../../constants/roles.js';

// Save as Draft / Submit to the next approver (FM: Post to Zoho Books)
export default function FormActions({ role, submitting, onSave }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '0.85rem 1.25rem', fontSize: '1rem' }}
        onClick={() => onSave(true)}
        disabled={submitting}
        title="Save without submitting. Assigned Property Managers see it as Draft."
      >
        💾 Save as Draft
      </button>
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }}
        onClick={() => onSave(false)}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Spinner light />
            Submitting...
          </>
        ) : (
          <>
            {role === 'FM' ? 'Post to Zoho Books' : `Submit to ${MANAGER_ROLE[role]}`}
            <Icon name="arrowRight" size={18} />
          </>
        )}
      </button>
    </div>
  );
}
