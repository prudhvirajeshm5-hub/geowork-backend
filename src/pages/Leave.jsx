
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Download, FileText, Users, X } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { formatDate, initials } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./leave.css";

const PAGE_SIZE = 10;
const REFRESH_MS = 30000;
const TYPE_TONE = { CL: "blue", EL: "green", SL: "red", ML: "purple", CO: "amber" };
const TABS = [
  { key: "requests", label: "Leave Requests" },
  { key: "types", label: "Leave Types" },
  { key: "balance", label: "Leave Balance" },
  { key: "calendar", label: "Leave Calendar" },
  { key: "holidays", label: "Holidays" },
];
const COMING = {
  balance: "Per-employee leave balances are coming in the next update.",
  calendar: "The leave calendar is coming in the next update.",
  holidays: "The holiday calendar is coming in the next update.",
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function Stat({ label, value, sub, tone, Icon }) {
  return (
    <div className="lv-stat">
      <span className={`lv-stat-icon lv-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="lv-stat-label">{label}</div>
        <div className="lv-stat-value">{value}</div>
        <div className="lv-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function Leave() {
  const [month, setMonth] = useState("");
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("requests");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadRows = () => {
    setLoading(true);
    setError("");
    return api
      .get("/leaves/all/", { params: month ? { month } : {} })
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load leave requests.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadRows();
    }, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    api.get("/leaves/types/").then(({ data }) => setTypes(data.results || data)).catch(() => {});
    api
      .get("/employees/", { params: { page_size: 500 } })
      .then(({ data }) => setEmployeeCount((data.results || data).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [month, statusFilter, deptFilter, query]);

  const today = isoDate(new Date());
  const in7 = addDays(today, 7);
  const approvedCount = rows.filter((r) => r.status === "APPROVED").length;
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  const onLeaveToday = rows.filter((r) => r.status === "APPROVED" && r.from_date <= today && today <= r.to_date).length;
  const upcoming = rows.filter((r) => ["APPROVED", "PENDING"].includes(r.status) && r.from_date > today && r.from_date <= in7).length;
  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (q && ![r.employee_name, r.employee_code, r.department].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, statusFilter, deptFilter, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const decide = async (row, action) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.post(`/leaves/${row.id}/decide/`, { action, note: "" });
      await loadRows();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update this request."));
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const header = ["Employee", "Code", "Department", "Leave Type", "From", "To", "Days", "Status", "Applied On"];
    const lines = filtered.map((r) =>
      [
        r.employee_name,
        r.employee_code,
        r.department,
        r.leave_type_name,
        r.from_date,
        r.to_date,
        r.days,
        r.status,
        r.created_at?.slice(0, 10),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="lv-head">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>Module 8</div>
          <h1 style={{ margin: 0 }}>Leave Management</h1>
          <p className="page-sub">Leave requests, balances and approvals for every employee.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled title="Applying leave on behalf of an employee is coming in the next update">
          Apply Leave
        </button>
      </div>

      <Alert>{error}</Alert>

      <div className="lv-stats">
        <Stat label="Total Employees" value={employeeCount} sub="active in the company" tone="blue" Icon={Users} />
        <Stat label="Total Leave Requests" value={rows.length} sub={`${approvedCount} approved · ${pendingCount} pending`} tone="green" Icon={FileText} />
        <Stat label="On Leave Today" value={onLeaveToday} sub="approved for today" tone="red" Icon={CalendarDays} />
        <Stat label="Upcoming Leaves" value={upcoming} sub="starting in the next 7 days" tone="purple" Icon={CalendarDays} />
      </div>

      <div className="lv-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`lv-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requests" && (
        <div className="lv-main">
          <section className="lv-card">
            <div className="lv-filters">
              <div className="lv-search">
                <input placeholder="Search by name, code or department…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} title="Leave the month empty to show every month" />
              {month && <button type="button" className="btn" onClick={() => setMonth("")}>All months</button>}
              <button type="button" className="btn" onClick={() => loadRows()}>Refresh</button>
              <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download size={15} /> Export
              </button>
            </div>

            {loading ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="lv-note">No leave requests match these filters.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data lv-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Employee</th>
                        <th>Leave Type</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Applied On</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={r.id}>
                          <td>{(curPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td>
                            <div className="lv-name">
                              <span className="lv-avatar">{initials(r.employee_name)}</span>
                              <div>
                                <div className="cell-primary">{r.employee_name}</div>
                                <div className="lv-sub">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`lv-type ${TYPE_TONE[r.leave_type_code] || "blue"}`}>{r.leave_type_name}</span>
                          </td>
                          <td>{formatDate(r.from_date)}</td>
                          <td>{formatDate(r.to_date)}</td>
                          <td>{r.days}</td>
                          <td>
                            <span className={`lv-pill ${r.status}`}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                          </td>
                          <td>{formatDate(r.created_at?.slice(0, 10))}</td>
                          <td>
                            {r.status === "PENDING" ? (
                              <div className="lv-act">
                                <button type="button" className="ok" title="Approve" disabled={busyId === r.id} onClick={() => decide(r, "approve")}>
                                  <Check size={15} />
                                </button>
                                <button type="button" className="no" title="Reject" disabled={busyId === r.id} onClick={() => decide(r, "reject")}>
                                  <X size={15} />
                                </button>
                              </div>
                            ) : (
                              <span className="lv-sub">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="lv-footer">
                  <span className="lv-sub">
                    Showing {(curPage - 1) * PAGE_SIZE + 1}-{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length} leave requests
                  </span>
                  <div className="lv-pager">
                    <button type="button" className="lv-pg" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>‹</button>
                    {Array.from({ length: pages }, (_, n) => n + 1).slice(0, 6).map((n) => (
                      <button key={n} type="button" className={`lv-pg${n === curPage ? " on" : ""}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" className="lv-pg" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>›</button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="lv-card">
            <div style={{ fontWeight: 800, color: "var(--ink)", marginBottom: 10 }}>Leave Types</div>
            {types.length === 0 ? (
              <div className="lv-sub">No leave types set up yet.</div>
            ) : (
              types.map((t) => (
                <div key={t.id} className="lv-type-row">
                  <div>
                    <div className="lv-type-name">{t.name}</div>
                    <div className="lv-sub">{t.code}</div>
                  </div>
                  <div className="lv-type-days">{t.annual_allowance} days / yr</div>
                </div>
              ))
            )}
          </aside>
        </div>
      )}

      {tab === "types" && (
        <div className="lv-card">
          {types.length === 0 ? (
            <div className="lv-note">No leave types set up yet.</div>
          ) : (
            types.map((t) => (
              <div key={t.id} className="lv-type-row">
                <div>
                  <div className="lv-type-name">{t.name}</div>
                  <div className="lv-sub">Code {t.code}</div>
                </div>
                <div className="lv-type-days">{t.annual_allowance} days / yr</div>
              </div>
            ))
          )}
        </div>
      )}

      {(tab === "balance" || tab === "calendar" || tab === "holidays") && (
        <div className="lv-card lv-note">{COMING[tab]}</div>
      )}
    </div>
  );
}
