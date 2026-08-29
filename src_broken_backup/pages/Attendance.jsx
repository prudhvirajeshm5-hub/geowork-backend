import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Loading, Pager, StatusBadge } from "../components/ui";
import { formatTime, initials, minutesToHM, todayISO } from "../lib/format";

const PAGE_SIZE = 25;

const STATUS_TONE = { PRESENT: "green", HALF_DAY: "amber", ABSENT: "red" };

export default function Attendance() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data));
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE, ordering: "-date" };
      if (date) params.date = date;
      if (status) params.status = status;
      if (branch) params.branch = branch;
      const { data } = await api.get("/attendance/records/", { params });
      setRows(data.results || data);
      setCount(data.count ?? (data.results || data).length);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load attendance records."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, date, status, branch]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 5</div>
          <h1>Attendance</h1>
          <p className="page-sub">Every check-in and check-out, manual or auto-geofenced.</p>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="card">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <input className="input" type="date" style={{ width: 160 }} value={date} onChange={(e) => { setPage(1); setDate(e.target.value); }} />
            <select className="input" style={{ width: 150 }} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="HALF_DAY">Half day</option>
              <option value="ABSENT">Absent</option>
            </select>
            <select className="input" style={{ width: 170 }} value={branch} onChange={(e) => { setPage(1); setBranch(e.target.value); }}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <span className="card-head-sub">{count} record{count === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <Loading label="Loading attendance…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nothing recorded" message="No attendance records match these filters." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Worked</th>
                    <th>Work area</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="sidebar-avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>
                            {initials(r.employee_name)}
                          </span>
                          <div>
                            <div className="cell-primary">{r.employee_name}</div>
                            <div className="cell-sub mono">{r.employee_code}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={STATUS_TONE[r.status] || "slate"}>{r.status.replace("_", " ")}</StatusBadge>
                      </td>
                      <td>
                        {formatTime(r.check_in_time)}
                        {r.check_in_time && <div className="cell-sub">{r.check_in_source === "AUTO_GEOFENCE" ? "Auto" : "Manual"}</div>}
                      </td>
                      <td>
                        {formatTime(r.check_out_time)}
                        {r.check_out_time && <div className="cell-sub">{r.check_out_source === "AUTO_GEOFENCE" ? "Auto" : "Manual"}</div>}
                      </td>
                      <td className="mono">{minutesToHM(r.working_minutes)}</td>
                      <td>{r.check_in_work_area_name || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {r.is_late && <StatusBadge tone="amber">Late {r.late_by_minutes}m</StatusBadge>}
                          {r.is_early_exit && <StatusBadge tone="amber">Early {r.early_exit_by_minutes}m</StatusBadge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
