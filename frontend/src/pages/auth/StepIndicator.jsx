import { Fragment } from 'react';

// "① —— ②  Account Details" progress indicator; earlier steps are clickable
export default function StepIndicator({ step, labels, onStep }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
      {labels.map((_, i) => {
        const s = i + 1;
        return (
          <Fragment key={s}>
            <div
              onClick={() => s < step && onStep(s)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: s < step ? 'pointer' : 'default',
                background: step >= s ? 'var(--primary-gradient)' : 'var(--color-surface-subtle)',
                color: step >= s ? '#fff' : 'var(--text-muted)',
                boxShadow: step === s ? 'var(--shadow-md)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {s}
            </div>
            {s < labels.length && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: step > s ? 'var(--primary)' : 'var(--color-border)',
                  borderRadius: 2,
                  transition: 'background 0.3s ease',
                }}
              />
            )}
          </Fragment>
        );
      })}
      <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        {labels[step - 1]}
      </span>
    </div>
  );
}
