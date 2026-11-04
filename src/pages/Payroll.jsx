
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Eye, Users, Wallet } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { initials } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./payroll.css";

const PAGE_SIZE = 10;

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function money(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function hours(mins) {
  const n = Number(mins) || 0;
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m`;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function Stat({ label, value, sub, tone, Icon }) {
  return (
    <div className={`pr-stat pr-tone-${tone}`}>
      <span className="pr-stat-icon">
        <Icon size={20} />
      </span>
      <div>
        <div className="pr-stat-label">{label}</div>
        <div className="pr-stat-value">{value}</div>
        <div className="pr-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const [month, setMonth] = useState(monthNow());
  const [branchId, setBranchId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("employees");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState(null);
  const [checked, setChecked] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data)).catch(() => {});
    api.get("/company/departments/", { params: { page_size: 200 } }).then(({ data }) => setDepartments(data.results || data)).catch(() => {});
    api.get("/employees/", { params: { page_size: 500 } }).then(({ data }) => setEmployees(data.results || data)).catch(() => {});
  }, []);

  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    setLoading(true);
    setError("");
    api
      .get("/payroll/monthly/", { params: { year: y, month: m } })
      .then(({ data }) => setPayroll(data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load payroll for this month.")))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    setPage(1);
  }, [month, branchId, deptId, statusFilter, query]);

  const empByCode = useMemo(() => Object.fromEntries(employees.map((e) => [e.employee_code, e])), [employees]);
  const deptName = (id) => departments.find((d) => String(d.id) === String(id))?.name || "—";

  const enriched = useMemo(
    () =>
      (payroll?.rows || []).map((r) => {
        const e = empByCode[r.employee_code] || {};
        return {
          ...r,
          key: r.employee_code,
          branch: e.branch,
          department: e.department,
          basic: e.monthly_salary,
          calculated: r.pay != null && r.status !== "NO_SALARY",
        };
      }),
    [payroll, empByCode]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((r) => {
      if (branchId && String(r.branch) !== String(branchId)) return false;
      if (deptId && String(r.department) !== String(deptId)) return false;
      if (statusFilter === "calculated" && !r.calculated) return false;
      if (statusFilter === "pending" && r.calculated) return false;
      if (q && ![r.employee_name, r.employee_code, deptName(r.department)].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [enriched, branchId, deptId, statusFilter, query, departments]);

  const total = enriched.length;
  const calculated = enriched.filter((r) => r.calculated).length;
  const pending = total - calculated;
  const totalCost = enriched.reduce((s, r) => s + (r.calculated ? Number(r.pay) : 0), 0);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const selected = enriched.find((r) => r.key === chosen) || enriched[0] || null;
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => checked.includes(r.key));

  const toggle = (key) => setChecked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleAll = () => setChecked(allOnPage ? [] : pageRows.map((r) => r.key));

  const exportCsv = () => {
    const header = ["Employee", "Code", "Department", "Basic Salary", "Worked Hours", "Late", "Net Pay", "Status"];
    const lines = filtered.map((r) =>
      [
        r.employee_name,
        r.employee_code,
        deptName(r.department),
        r.basic ?? "",
        hours(r.worked_minutes),
        hours(r.late_minutes),
        r.calculated ? r.pay : "",
        r.calculated ? "Estimated" : "Salary not set",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="pr-head">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>Module 7</div>
          <h1 style={{ margin: 0 }}>Earnings / Payroll</h1>
          <p className="page-sub">Manage monthly payroll, payslips and earnings breakdown for each employee.</p>
        </div>
        <div className="pr-controls">
          <input type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" disabled title="Payroll processing is coming in the next update">
            <Wallet size={15} /> Process Payroll
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="pr-stats">
        <Stat label="Total Employees" value={total} sub="in this month" tone="green" Icon={Users} />
        <Stat label="Total Payroll Cost" value={money(totalCost)} sub="estimated" tone="blue" Icon={Wallet} />
        <Stat label="Calculated" value={calculated} sub={`${pct(calculated, total)}% of total employees`} tone="amber" Icon={CheckCircle2} />
        <Stat label="Salary Not Set" value={pending} sub={`${pct(pending, total)}% of total employees`} tone="red" Icon={Clock} />
      </div>

      <div className="pr-tabs">
        <button type="button" className={`pr-tab${tab === "employees" ? " on" : ""}`} onClick={() => setTab("employees")}>Employee Payroll</button>
        <button type="button" className={`pr-tab${tab === "payslips" ? " on" : ""}`} onClick={() => setTab("payslips")}>Payslips</button>
        <button type="button" className={`pr-tab${tab === "breakdown" ? " on" : ""}`} onClick={() => setTab("breakdown")}>Earnings Breakdown</button>
      </div>

      {tab !== "employees" ? (
        <div className="pr-card pr-note">
          {tab === "payslips" ? "Payslips are coming in the next update." : "The earnings breakdown is coming in the next update."}
        </div>
      ) : (
        <div className="pr-main">
          <section className="pr-card">
            <div className="pr-filters">
              <div className="pr-search">
                <input placeholder="Search by name, code, department…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="calculated">Calculated</option>
                <option value="pending">Salary not set</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download size={15} /> Export
              </button>
            </div>

            {loading ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="pr-note">No employees match these filters.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data pr-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input type="checkbox" checked={allOnPage} onChange={toggleAll} />
                        </th>
                        <th style={{ width: 40 }}>#</th>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Basic Salary</th>
                        <th>Worked Hours</th>
                        <th>Late</th>
                        <th>Net Pay</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={r.key}>
                          <td>
                            <input type="checkbox" checked={checked.includes(r.key)} onChange={() => toggle(r.key)} />
                          </td>
                          <td>{(curPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td>
                            <div className="pr-name">
                              <span className="pr-avatar">{initials(r.employee_name)}</span>
                              <div>
                                <div className="cell-primary">{r.employee_name}</div>
                                <div className="pr-sub">{r.employee_code}</div>
                              </div>
                            </div>
                          </td>
                          <td>{deptName(r.department)}</td>
                          <td>{money(r.basic)}</td>
                          <td>{hours(r.worked_minutes)}</td>
                          <td>{hours(r.late_minutes)}</td>
                          <td>{r.calculated ? money(r.pay) : "—"}</td>
                          <td>
                            <span className={`pr-pill ${r.calculated ? "ok" : "pending"}`}>
                              {r.calculated ? "Estimated" : "Salary not set"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`pr-row-btn${selected?.key === r.key ? " on" : ""}`}
                              title="View summary"
                              onClick={() => setChosen(r.key)}
                            >
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pr-footer">
                  <span className="pr-sub">
                    Showing {(curPage - 1) * PAGE_SIZE + 1}-{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length} employees
                  </span>
                  <div className="pr-pager">
                    <button type="button" className="pr-pg" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: pages }, (_, n) => n + 1).slice(0, 6).map((n) => (
                      <button key={n} type="button" className={`pr-pg${n === curPage ? " on" : ""}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" className="pr-pg" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="pr-card">
            {!selected ? (
              <div className="pr-note">Select an employee to see their payroll summary.</div>
            ) : (
              <>
                <div className="pr-side-head">
                  <span className="pr-avatar" style={{ width: 46, height: 46 }}>{initials(selected.employee_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pr-side-name">{selected.employee_name}</div>
                    <div className="pr-sub">{selected.employee_code} · {deptName(selected.department)}</div>
                  </div>
                  <span className={`pr-pill ${selected.calculated ? "ok" : "pending"}`}>
                    {selected.calculated ? "Estimated" : "Not set"}
                  </span>
                </div>
                <div className="pr-net">
                  <div className="pr-net-label">Net Pay (Estimated)</div>
                  <div className="pr-net-value">{selected.calculated ? money(selected.pay) : "—"}</div>
                </div>
                <div className="pr-facts">
                  <div className="pr-fact">Basic Salary<b>{money(selected.basic)}</b></div>
                  <div className="pr-fact">Days Recorded<b>{selected.days_recorded ?? 0}</b></div>
                  <div className="pr-fact">Worked Hours<b>{hours(selected.worked_minutes)}</b></div>
                  <div className="pr-fact">Late<b>{hours(selected.late_minutes)}</b></div>
                  <div className="pr-fact">Early Exit<b>{hours(selected.early_exit_minutes)}</b></div>
                  <div className="pr-fact">Outside Area<b>{hours(selected.outside_minutes)}</b></div>
                </div>
                <div className="pr-side-actions">
                  <button type="button" disabled title="Payslips are coming in the next update">View Payslip</button>
                  <button type="button" disabled title="Payslips are coming in the next update">Download Payslip</button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
