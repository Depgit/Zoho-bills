// "1–25 of 132"  ‹ 1 2 3 … 6 ›  [25 / page]
const SIZES = [10, 25, 50, 100];

function pageList(page, pages) {
  const out = new Set([1, pages, page - 1, page, page + 1]);
  return [...out].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
}

export default function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  let prev = 0;
  return (
    <div className="pager">
      <span className="pager-info">
        {from}–{to} of {total}
      </span>
      <div className="pager-pages">
        <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        {pageList(page, pages).map((p) => {
          const gap = p - prev > 1;
          prev = p;
          return (
            <span key={p} className="pager-group">
              {gap && <span className="pager-gap">…</span>}
              <button type="button" className={`pager-btn ${p === page ? 'active' : ''}`} onClick={() => onPage(p)}>
                {p}
              </button>
            </span>
          );
        })}
        <button type="button" className="pager-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
      {onPageSize && (
        <select className="pager-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
