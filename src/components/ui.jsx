import { useState } from "react";
import { X, Inbox, SearchX } from "lucide-react";

export function Loading({ label = "Loading…" }) {
  return (
    <div className="loading-row">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="empty-state">
      <Icon />
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function NoResults({ query }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No matches"
      message={query ? `Nothing found for "${query}". Try a different search.` : "No records match these filters."}
    />
  );
}

export function Alert({ children, tone = "error" }) {
  if (!children) return null;
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="card-head-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>{message}</p>
      <div className="form-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function StatusBadge({ tone = "slate", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function SearchBox({ onChange, placeholder = "Search…", initialValue = "" }) {
  const [text, setText] = useState(initialValue);
  return (
    <div className="search-box">
      <SearchIcon />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function Pager({ page, pageSize, count, onPage }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pager">
      <span>
        Page {page} of {totalPages} · {count} total
      </span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
