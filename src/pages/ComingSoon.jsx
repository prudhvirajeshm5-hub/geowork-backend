
export default function ComingSoon({ title, description }) {
  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="page-sub">{description}</p>
        </div>
      </div>
      <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--ink-faint)" }}>
        This page is coming in the next update.
      </div>
    </div>
  );
}
