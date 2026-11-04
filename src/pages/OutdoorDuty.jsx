
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Check, CheckCircle2, Clock, Download, Send, X, XCircle } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { formatDate, initials } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./outdoor.css";

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All Requests" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "calendar", label: "Calendar" },
  { key: "mine", label: "My Requests" },
];
const EMPTY_FORM = { employee: "", start: "", end: "", purpose: "" };

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRange() {
  const d = new Date();
  return { from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000) + 1;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function Stat({ label, value, sub, tone, Icon }) {
  return (
    <div className="od-stat">
      <span className={`od-stat-icon od-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="od-stat-label">{label}</div>
        <div className="od-stat-value">{value}</div>
        <div className="od-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function OutdoorDuty() {
  const [range, setRange] = useState(monthRange());
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    return api
      .get("/attendance/outdoor-duty/", { params: { page_size: 500 } })
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load outdoor duty requests.")))
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
  }, [range, branchId, tab, query, deptFilter]);

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const deptName = (id) => departments.find((d) => String(d.id) === String(id))?.name || "";

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const e = empById[r.employee] || {};
        return { ...r, branch: e.branch, department: deptName(e.department), days: daysBetween(r.start_date, r.end_date) };
      }),
    [rows, empById, departments]
  );

  const inScope = useMemo(
    () =>
      enriched.filter(
        (r) =>
          r.start_date <= range.to &&
          r.end_date >= range.from &&
          (!branchId || String(r.branch) === String(branchId))
      ),
    [enriched, range, branchId]
  );

  const total = inScope.length;
  const approved = inScope.filter((r) => r.status === "APPROVED").length;
  const pending = inScope.filter((r) => r.status === "PENDING").length;
  const rejected = inScope.filter((r) => r.status === "REJECTED").length;

  const today = isoDate(new Date());
  const todayList = enriched.filter(
    (r) => r.status === "APPROVED" && r.start_date <= today && today <= r.end_date && (!branchId || String(r.branch) === String(branchId))
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((r) => {
      if (["PENDING", "APPROVED", "REJECTED"].includes(tab) && r.status !== tab) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (q && ![r.employee_name, r.employee_code, r.reason, r.department].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [inScope, tab, deptFilter, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const departmentsInUse = [...new Set(enriched.map((r) => r.department).filter(Boolean))].sort();

  const decide = async (row, action) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.post(`/attendance/outdoor-duty/${row.id}/${action}/`, { decision_note: "" });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update this request."));
    } finally {
      setBusyId(null);
    }
  };

  const submit = async () => {
    if (!form.employee || !form.start || !form.end || !form.purpose.trim()) {
      setError("Choose an employee, the dates and the purpose.");
      return;
    }
    if (form.end < form.start) {
      setError("End date can't be before start date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/attendance/outdoor-duty/", {
        employee: Number(form.employee),
        start_date: form.start,
        end_date: form.end,
        reason: form.purpose.trim(),
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't assign outdoor duty."));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["Employee", "Code", "Department", "From", "To", "Days", "Purpose", "Status"];
    const lines = filtered.map((r) =>
      [r.employee_name, r.employee_code, r.department, r.start_date, r.end_date, r.days, r.reason, r.status]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outdoor-duty-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="od-head">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>Module 9</div>
          <h1 style={{ margin: 0 }}>Outdoor Duty</h1>
          <p className="page-sub">Outdoor duty and shift permission requests with their approval status.</p>
        </div>
        <div className="od-controls">
          <input type="date" className="input" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          <input type="date" className="input" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => document.getElementById("od-form")?.scrollIntoView({ behavior: "smooth" })}>
            <Briefcase size={15} /> Assign Outdoor Duty
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="od-stats">
        <Stat label="Total Requests" value={total} sub="in the selected period" tone="green" Icon={Briefcase} />
        <Stat label="Approved" value={approved} sub={`${pct(approved, total)}% of total requests`} tone="blue" Icon={CheckCircle2} />
        <Stat label="Pending" value={pending} sub={`${pct(pending, total)}% of total requests`} tone="amber" Icon={Clock} />
        <Stat label="Rejected" value={rejected} sub={`${pct(rejected, total)}% of total requests`} tone="red" Icon={XCircle} />
      </div>

      <div className="od-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`od-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calendar" || tab === "mine" ? (
        <div className="od-card od-note">
          {tab === "calendar" ? "The outdoor duty calendar is coming in the next update." : "My outdoor duty requests are coming in the next update."}
        </div>
      ) : (
        <div className="od-main">
          <section className="od-card">
            <div className="od-filters">
              <div className="od-search">
                <input placeholder="Search employee name, code, purpose…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departmentsInUse.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download size={15} /> Export
              </button>
            </div>

            {loading ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="od-note">No outdoor duty requests match these filters.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data od-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Purpose</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={r.id}>
                          <td>{(curPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td>
                            <div className="od-name">
                              <span className="od-avatar">{initials(r.employee_name)}</span>
                              <div>
                                <div className="cell-primary">{r.employee_name}</div>
                                <div className="od-sub">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</div>
                              </div>
                            </div>
                          </td>
                          <td>{formatDate(r.start_date)}{r.end_date !== r.start_date ? ` – ${formatDate(r.end_date)}` : ""}</td>
                          <td>{r.reason || "—"}</td>
                          <td>{r.days} day{r.days === 1 ? "" : "s"}</td>
                          <td>
                            <span className={`od-pill ${r.status}`}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                          </td>
                          <td>
                            {r.status === "PENDING" ? (
                              <div className="od-act">
                                <button type="button" className="ok" title="Approve" disabled={busyId === r.id} onClick={() => decide(r, "approve")}>
                                  <Check size={15} />
                                </button>
                                <button type="button" className="no" title="Reject" disabled={busyId === r.id} onClick={() => decide(r, "reject")}>
                                  <X size={15} />
                                </button>
                              </div>
                            ) : (
                              <span className="od-sub">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="od-footer">
                  <span className="od-sub">
                    Showing {(curPage - 1) * PAGE_SIZE + 1}-{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length} requests
                  </span>
                  <div className="od-pager">
                    <button type="button" className="od-pg" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>‹</button>
                    {Array.from({ length: pages }, (_, n) => n + 1).slice(0, 6).map((n) => (
                      <button key={n} type="button" className={`od-pg${n === curPage ? " on" : ""}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" className="od-pg" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>›</button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside>
            <section className="od-card od-form" id="od-form" style={{ marginBottom: 16 }}>
              <div className="od-title">Assign Outdoor Duty</div>
              <label>Employee <span>*</span></label>
              <select className="input" value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}>
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.user?.full_name} ({e.employee_code})</option>
                ))}
              </select>
              <label>From date <span>*</span></label>
              <input type="date" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              <label>To date <span>*</span></label>
              <input type="date" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              <label>Purpose <span>*</span></label>
              <textarea
                className="input"
                maxLength={250}
                placeholder="Enter purpose of outdoor duty…"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
              <div className="od-count">{form.purpose.length}/250</div>
              <button type="button" className="btn btn-primary od-submit" onClick={submit} disabled={saving}>
                <Send size={15} /> {saving ? "Submitting…" : "Submit Request"}
              </button>
            </section>

            <section className="od-card">
              <div className="od-title">Today's Outdoor Duty ({todayList.length})</div>
              {todayList.length === 0 ? (
                <div className="od-sub">No one is on approved outdoor duty today.</div>
              ) : (
                todayList.map((r) => (
                  <div key={r.id} className="od-today">
                    <span className="od-avatar">{initials(r.employee_name)}</span>
                    <div className="od-today-main">
                      <b>{r.employee_name}</b>
                      <span className="od-sub">{r.reason || "—"}</span>
                    </div>
                    <span className="od-live">On Duty</span>
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
