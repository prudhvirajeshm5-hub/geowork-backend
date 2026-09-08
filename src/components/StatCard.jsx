const TONES = {
  green: { bg: "var(--brand-soft)", fg: "var(--brand-dark)" },
  amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  red: { bg: "var(--red-soft)", fg: "var(--red)" },
  blue: { bg: "var(--blue-soft)", fg: "var(--blue)" },
  slate: { bg: "var(--slate-soft)", fg: "var(--slate)" },
};

export default function StatCard({ icon: Icon, label, value, tone = "slate" }) {
  const t = TONES[tone] || TONES.slate;
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon" style={{ background: t.bg, color: t.fg }}>
          {Icon && <Icon />}
        </span>
      </div>
      <div className="stat-value">{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
