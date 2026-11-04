
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, MessageSquareWarning, Play, Check } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { formatDate, initials } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./complaints.css";

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All Complaints" },
  { key: "OPEN", label: "Pending" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "mine", label: "My Complaints" },
];
const STATUS_LABEL = { OPEN: "Pending", IN_PROGRESS: "In Progress", RESOLVED: "Resolved" };
const UNAVAILABLE = {
  rejected: "Rejected complaints aren't a separate status yet, so this view isn't available.",
  mine: "Complaints you raised yourself are shown under the employee's own portal, not here.",
};

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRange() {
  const d = new Date();
  return { from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function Stat({ label, value, sub, tone, Icon }) {
  return (
    <div className={`cm-stat cm-tone-${tone}`}>
      <span className="cm-stat-icon">
        <Icon size={20} />
      </span>
      <div>
        <div className="cm-stat-label">{label}</div>
        <div className="cm-stat-value">{value}</div>
        <div className="cm-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function Complaints() {
  const [range, setRange] = useState(monthRange());
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [prioFilter, setPrioFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState(null);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    return api
      .get("/complaints/company/")
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load complaints.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get("/employees/", { params: { page_size: 500 } }).then(({ data }) => setEmployees(data.results || data)).catch(() => {});
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data)).catch(() => {});
    api.get("/company/departments/", { params: { page_size: 200 } }).then(({ data }) => setDepartments(data.results || data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [range, branchId, tab, query, catFilter, prioFilter, deptFilter, statusFilter]);

  const deptName = (id) => departments.find((d) => String(d.id) === String(id))?.name || "";
  const empByName = useMemo(() => {
    const m = {};
    employees.forEach((e) => {
      if (e.user?.full_name) m[e.user.full_name] = e;
    });
    return m;
  }, [employees]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const emp = empByName[r.employee_name] || {};
        return { ...r, branch: emp.branch, department: deptName(emp.department), day: (r.created_at || "").slice(0, 10) };
      }),
    [rows, empByName, departments]
  );

  const inScope = useMemo(
    () =>
      enriched.filter(
        (r) => r.day >= range.from && r.day <= range.to && (!branchId || String(r.branch) === String(branchId))
      ),
    [enriched, range, branchId]
  );

  const total = inScope.length;
  const resolved = inScope.filter((r) => r.status === "RESOLVED").length;
  const inProgress = inScope.filter((r) => r.status === "IN_PROGRESS").length;
  const pending = inScope.filter((r) => r.status === "OPEN").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((r) => {
      if (tab === "OPEN" || tab === "IN_PROGRESS" || tab === "RESOLVED") {
        if (r.status !== tab) return false;
      }
      if (statusFilter && r.status !== statusFilter) return false;
      if (catFilter && r.category_code !== catFilter) return false;
      if (prioFilter && r.priority_code !== prioFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (q && ![r.employee_name, r.subject].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [inScope, tab, statusFilter, catFilter, prioFilter, deptFilter, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const selected = enriched.find((r) => r.id === chosen) || filtered[0] || null;
  const departmentsInUse = [...new Set(enriched.map((r) => r.department).filter(Boolean))].sort();

  useEffect(() => {
    setNote(selected?.resolution_note || "");
  }, [selected?.id]);

  const update = async (payload) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/complaints/${selected.id}/`, payload);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update this complaint."));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ["Employee", "Department", "Subject", "Category", "Priority", "Status", "Raised On"];
    const lines = filtered.map((r) =>
      [r.employee_name, r.department, r.subject, r.category, r.priority, STATUS_LABEL[r.status] || r.status, r.day]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `complaints-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emp = selected ? empByName[selected.employee_name] : null;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="cm-head">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>Module 10</div>
          <h1 style={{ margin: 0 }}>Complaints</h1>
          <p className="page-sub">Employee complaints and support requests, with priority and status.</p>
        </div>
        <div className="cm-controls">
          <input type="date" className="input" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          <input type="date" className="input" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="cm-stats">
        <Stat label="Total Complaints" value={total} sub="in the selected period" tone="blue" Icon={MessageSquareWarning} />
        <Stat label="Resolved" value={resolved} sub={`${pct(resolved, total)}% of total complaints`} tone="green" Icon={CheckCircle2} />
        <Stat label="In Progress" value={inProgress} sub={`${pct(inProgress, total)}% of total complaints`} tone="amber" Icon={Clock} />
        <Stat label="Pending" value={pending} sub={`${pct(pending, total)}% of total complaints`} tone="red" Icon={MessageSquareWarning} />
      </div>

      <div className="cm-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`cm-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {UNAVAILABLE[tab] ? (
        <div className="cm-card cm-note">{UNAVAILABLE[tab]}</div>
      ) : (
        <div className="cm-main">
          <section className="cm-card">
            <div className="cm-filters">
              <div className="cm-search">
                <input placeholder="Search employee name or subject…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departmentsInUse.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select className="input" value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="OPEN">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="">All Categories</option>
                <option value="WORKPLACE">Workplace Issue</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="COLLEAGUE">Colleague</option>
                <option value="OTHER">Other</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download size={15} /> Export
              </button>
            </div>

            {loading ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="cm-note">No complaints match these filters.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data cm-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Employee</th>
                        <th>Subject</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Raised On</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={r.id} className={`cm-row${selected?.id === r.id ? " on" : ""}`} onClick={() => setChosen(r.id)}>
                          <td>{(curPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td>
                            <div className="cm-name">
                              <span className="cm-avatar">{initials(r.employee_name)}</span>
                              <div>
                                <div className="cell-primary">{r.employee_name}</div>
                                <div className="cm-sub">{r.department || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td>{r.subject}</td>
                          <td>{r.category}</td>
                          <td>
                            <span className={`cm-prio ${r.priority_code}`}>{r.priority}</span>
                          </td>
                          <td>{formatDate(r.day)}</td>
                          <td>
                            <span className={`cm-pill ${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cm-footer">
                  <span className="cm-sub">
                    Showing {(curPage - 1) * PAGE_SIZE + 1}-{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length} complaints
                  </span>
                  <div className="cm-pager">
                    <button type="button" className="cm-pg" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: pages }, (_, n) => n + 1).slice(0, 6).map((n) => (
                      <button key={n} type="button" className={`cm-pg${n === curPage ? " on" : ""}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" className="cm-pg" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="cm-card cm-panel">
            {!selected ? (
              <div className="cm-note">Select a complaint to see its details.</div>
            ) : (
              <>
                <div className="cm-panel-head">
                  <span className="cm-avatar" style={{ width: 44, height: 44 }}>{initials(selected.employee_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cm-panel-name">{selected.employee_name}</div>
                    <div className="cm-sub">{emp?.employee_code || ""}{selected.department ? ` · ${selected.department}` : ""}</div>
                  </div>
                  <span className={`cm-pill ${selected.status}`}>{STATUS_LABEL[selected.status] || selected.status}</span>
                </div>
                <div className="cm-grid2">
                  <div>
                    <div className="cm-label">Subject</div>
                    <div className="cm-value">{selected.subject}</div>
                  </div>
                  <div>
                    <div className="cm-label">Category</div>
                    <div className="cm-value">{selected.category}</div>
                  </div>
                  <div>
                    <div className="cm-label">Priority</div>
                    <div className="cm-value">
                      <span className={`cm-prio ${selected.priority_code}`}>{selected.priority}</span>
                    </div>
                  </div>
                  <div>
                    <div className="cm-label">Raised On</div>
                    <div className="cm-value">{formatDate(selected.day)}</div>
                  </div>
                </div>
                <div className="cm-label">Description</div>
                <div className="cm-desc">{selected.description}</div>
                {selected.status === "RESOLVED" && selected.resolution_note && (
                  <>
                    <div className="cm-label">Resolution</div>
                    <div className="cm-desc">{selected.resolution_note}</div>
                  </>
                )}
                {selected.status !== "RESOLVED" && (
                  <>
                    <div className="cm-label">Resolution note (optional)</div>
                    <textarea className="input" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done to resolve this?" />
                  </>
                )}
                <div className="cm-panel-actions">
                  <button type="button" disabled title="Comments aren't supported yet">Add Comment</button>
                  {selected.status === "RESOLVED" ? (
                    <button type="button" disabled>Resolved</button>
                  ) : selected.status === "OPEN" ? (
                    <button type="button" disabled={busy} onClick={() => update({ status: "IN_PROGRESS" })}>
                      <Play size={14} /> Start Progress
                    </button>
                  ) : (
                    <button type="button" className="primary" disabled={busy} onClick={() => update({ status: "RESOLVED", resolution_note: note })}>
                      <Check size={14} /> Mark as Resolved
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
