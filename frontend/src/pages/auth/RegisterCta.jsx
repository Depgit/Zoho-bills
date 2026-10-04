// "New organisation? Register as its Admin" box under the login form
export default function RegisterCta({ onClick }) {
  return (
    <div
      style={{
        marginTop: '1.5rem',
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.06) 0%, rgba(16, 185, 129, 0.06) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', fontWeight: 500 }}>
        New organisation? Register as its Admin
      </p>
      <button
        onClick={onClick}
        className="btn btn-sm"
        style={{
          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
          color: '#fff',
          border: 'none',
          fontWeight: 600,
          padding: '0.4rem 1.25rem',
          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
        }}
      >
        🏦 Register with Zoho Account
      </button>
    </div>
  );
}
