import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, FileText, TableProperties } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Loading } from "../components/ui";
import { todayISO } from "../lib/format";

const REPORTS = [
  { key: "daily-attendance", label: "Daily attendance", endpoint: "/reports/daily-attendance/", dateMode: "single" },
  { key: "monthly-attendance", label: "Monthly attendance", endpoint: "/reports/monthly-attendance/", dateMode: "month" },
  { key: "working-hours", label: "Working hours", endpoint: "/reports/working-hours/", dateMode: "range" },
  { key: "late", label: "Late arrivals", endpoint: "/reports/late/", dateMode: "range" },
  { key: "overtime", label: "Overtime", endpoint: "/reports/overtime/", dateMode: "range" },
  { key: "attendance-percentage", label: "Attendance %", endpoint: "/reports/attendance-percentage/", dateMode: "range" },
];

function lastWeekISO() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

/** Derive a couple of honest summary chips straight from the rows the API returned — nothing fabricated. */
function summarize(reportKey, rows, columns) {
  if (!rows.length) return [];
  const idx = (label) => columns.indexOf(label);

  if (reportKey === "daily-attendance") {
    const statusIdx = idx("Status");
    const present = rows.filter((r) => r[statusIdx] === "PRESENT").length;
    const absent = rows.filter((r) => r[statusIdx] === "ABSENT").length;
    const halfDay = rows.filter((r) => r[statusIdx] === "HALF_DAY").length;
    return [
      { label: "Records", value: rows.length },
      { label: "Present", value: present },
      { label: "Absent", value: absent },
      { label: "Half day", value: halfDay },
    ];
  }
  if (reportKey === "monthly-attendance") {
    const presentIdx = idx("Present");
    const lateIdx = idx("Late Count");
    const totalPresent = rows.reduce((s, r) => s + Number(r[presentIdx] || 0), 0);
    const totalLate = rows.reduce((s, r) => s + Number(r[lateIdx] || 0), 0);
    return [
      { label: "Employees", value: rows.length },
      { label: "Total present days", value: totalPresent },
      { label: "Total late count", value: totalLate },
    ];
  }
  if (reportKey === "working-hours") {
    const daysIdx = idx("Days Worked");
    const totalDays = rows.reduce((s, r) => s + Number(r[daysIdx] || 0), 0);
    return [
      { label: "Employees", value: rows.length },
      { label: "Total days worked", value: totalDays },
    ];
  }
  if (reportKey === "late") {
    const lateByIdx = idx("Late By (min)");
    const avg = Math.round(rows.reduce((s, r) => s + Number(r[lateByIdx] || 0), 0) / rows.length);
    return [
      { label: "Late instances", value: rows.length },
      { label: "Avg late by", value: `${avg} min` },
    ];
  }
  if (reportKey === "overtime") {
    const otIdx = idx("Overtime (min)");
    const totalMinutes = rows.reduce((s, r) => s + Number(r[otIdx] || 0), 0);
    return [
      { label: "Records with overtime", value: rows.length },
      { label: "Total overtime", value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` },
    ];
  }
  if (reportKey === "attendance-percentage") {
    const pctIdx = idx("Attendance %");
    const avg = rows.reduce((s, r) => s + parseFloat(r[pctIdx]), 0) / rows.length;
    return [
      { label: "Employees", value: rows.length },
      { label: "Avg attendance", value: `${avg.toFixed(1)}%` },
    ];
  }
  return [{ label: "Rows", value: rows.length }];
}

export default function Reports() {
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const report = REPORTS.find((r) => r.key === reportKey);

  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branch, setBranch] = useState("");
  const [employee, setEmployee] = useState("");

  const [date, setDate] = useState(todayISO());
  const [dateFrom, setDateFrom] = useState(lastWeekISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data));
    api.get("/employees/", { params: { page_size: 200 } }).then(({ data }) => setEmployees(data.results || data));
  }, []);

  const params = useMemo(() => {
    const p = {};
    if (branch) p.branch = branch;
    if (employee) p.employee = employee;
    if (report.dateMode === "single") p.date = date;
    if (report.dateMode === "month") {
      p.year = year;
      p.month = month;
    }
    if (report.dateMode === "range") {
      p.date_from = dateFrom;
      p.date_to = dateTo;
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, branch, employee, date, dateFrom, dateTo, year, month]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(report.endpoint, { params });
      setData(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't generate this report."));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleExport = async (format) => {
    setExporting(format);
    setError("");
    try {
      const res = await api.get(report.endpoint, {
        params: { ...params, export: format },
        responseType: "blob",
      });
      const disposition = res.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${report.key}.${format === "excel" ? "xlsx" : "pdf"}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, `Couldn't export as ${format.toUpperCase()}.`));
    } finally {
      setExporting("");
    }
  };

  const summary = data ? summarize(reportKey, data.rows, data.columns) : [];

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 8</div>
          <h1>Reports</h1>
          <p className="page-sub">Attendance, working hours, late arrivals and overtime — generated live from attendance records.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" disabled={!data?.rows?.length || exporting} onClick={() => handleExport("excel")}>
            <FileSpreadsheet size={14} />
            {exporting === "excel" ? "Exporting…" : "Export Excel"}
          </button>
          <button className="btn btn-sm" disabled={!data?.rows?.length || exporting} onClick={() => handleExport("pdf")}>
            <FileText size={14} />
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="tabs">
        {REPORTS.map((r) => (
          <button key={r.key} className={`tab ${reportKey === r.key ? "active" : ""}`} onClick={() => setReportKey(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <Alert>{error}</Alert>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            {report.dateMode === "single" && (
              <input className="input" type="date" style={{ width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} />
            )}
            {report.dateMode === "month" && (
              <>
                <select className="input" style={{ width: 150 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
                <select className="input" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </>
            )}
            {report.dateMode === "range" && (
              <>
                <input className="input" type="date" style={{ width: 160 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>to</span>
                <input className="input" type="date" style={{ width: 160 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </>
            )}
            <select className="input" style={{ width: 170 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: 190 }} value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.user?.full_name || e.employee_code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <Loading label="Generating report…" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data for this period" message="Try a different date range, branch, or employee." />
      ) : (
        <>
          {summary.length > 0 && (
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {summary.map((s) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <div>
                <h3>{data.title}</h3>
                <div className="card-head-sub">{data.rows.length} row{data.rows.length === 1 ? "" : "s"}</div>
              </div>
              <TableProperties size={18} color="var(--ink-faint)" />
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className={j === 0 ? "mono" : undefined}>
                          {cell === "" || cell == null ? "—" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <Download size={12} /> Exports are generated server-side from the same filtered dataset shown above.
      </p>
    </div>
  );
}
