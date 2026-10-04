import { useState } from 'react';
import Icon from '../../components/common/Icon.jsx';

// Comment + Reject / Approve buttons
export default function ReviewActions({ stage, onDecide }) {
  const [comment, setComment] = useState('');
  const approveLabel = stage === 'FM' ? 'Approve & Post to Zoho Books' : `Approve → ${{ CM: 'OM', OM: 'FM' }[stage] || 'next'}`;
  return (
    <div className="review-actions-bar">
      <input
        className="form-control review-comment-input"
        placeholder="Add reviewer notes or reason for rejection…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="button" className="btn btn-outline-danger" onClick={() => onDecide('reject', comment)}>
        <Icon name="x" size={16} />
        Reject Bill
      </button>
      <button type="button" className="btn btn-success" onClick={() => onDecide('approve', comment)}>
        <Icon name="check" size={16} />
        {approveLabel}
      </button>
    </div>
  );
}
