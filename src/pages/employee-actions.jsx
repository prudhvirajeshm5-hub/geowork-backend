
import { useEffect, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Mail, MapPin, Phone, UserCheck, UserX, Lock, Clock, Briefcase, Wifi, Battery, Navigation } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, Modal } from "../components/ui";
import { formatDate, initials } from "../lib/format";
import "./employee-actions.css";

const MAPS_OPTIONS = { id: "geowork-maps", googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY };

function Person({ emp, subtitle, badge }) {
  return (
    <div className="ea-person">
      <span className="ea-avatar">{initials(emp.user?.full_name)}</span>
      <div className="ea-person-text">
        <div className="ea-name">{emp.user?.full_name}</div>
        <div className="ea-sub">{subtitle || emp.employee_code}</div>
      </div>
      {badge}
    </div>
  );
}

function StatusChip({ active }) {
  return <span className={`ea-chip ${active ? "ok" : "off"}`}>{active ? "Active" : "Inactive"}</span>;
}

function nameFrom(list, id, key = "name") {
  return list.find((x) => String(x.id) === String(id))?.[key] || "—";
}

function Info({ label, value, Icon }) {
  return (
    <div className="ea-info">
      {Icon && <Icon size={15} />}
      <div>
        <div className="ea-info-label">{label}</div>
        <div className="ea-info-value">{value || "—"}</div>
      </div>
    </div>
  );
}

export function ViewEmployeeModal({ emp, lookups, onClose, onEdit }) {
  const [tab, setTab] = useState("overview");
  const manager = lookups.employees.find((e) => String(e.id) === String(emp.manager))?.user?.full_name;
  const tabs = [
    ["overview", "Overview"],
    ["organisation", "Organisation"],
    ["shift", "Work & Shift"],
    ["contact", "Contact"],
  ];
  return (
    <Modal title="View Employee" onClose={onClose} wide>
      <Person
        emp={emp}
        subtitle={`${emp.employee_code} · ${nameFrom(lookups.departments, emp.department)}`}
        badge={<StatusChip active={emp.status === "ACTIVE"} />}
      />
      <div className="ea-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={`ea-tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ea-grid">
        {tab === "overview" && (
          <>
            <Info label="Full Name" value={emp.user?.full_name} Icon={UserCheck} />
            <Info label="Employee Code" value={emp.employee_code} Icon={Briefcase} />
            <Info label="Phone Number" value={emp.user?.phone} Icon={Phone} />
            <Info label="Email" value={emp.user?.email} Icon={Mail} />
          </>
        )}
        {tab === "organisation" && (
          <>
            <Info label="Branch" value={nameFrom(lookups.branches, emp.branch)} Icon={MapPin} />
            <Info label="Department" value={nameFrom(lookups.departments, emp.department)} Icon={Briefcase} />
            <Info label="Designation" value={nameFrom(lookups.designations, emp.designation, "title")} Icon={Briefcase} />
            <Info label="Reports To" value={manager} Icon={UserCheck} />
            <Info label="Joined On" value={emp.date_of_joining ? formatDate(emp.date_of_joining) : ""} Icon={Clock} />
          </>
        )}
        {tab === "shift" && (
          <>
            <Info label="Shift" value={nameFrom(lookups.shifts, emp.shift)} Icon={Clock} />
            <Info label="Status" value={emp.status === "ACTIVE" ? "Active" : "Inactive"} Icon={UserCheck} />
          </>
        )}
        {tab === "contact" && (
          <>
            <Info label="Emergency Contact" value={emp.emergency_contact_name} Icon={UserCheck} />
            <Info label="Emergency Phone" value={emp.emergency_contact_phone} Icon={Phone} />
            <div className="ea-full">
              <Info label="Address" value={emp.address} Icon={MapPin} />
            </div>
          </>
        )}
      </div>
      <div className="ea-footer">
        <button type="button" className="btn" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={onEdit}>Edit Employee</button>
      </div>
    </Modal>
  );
}

export function ChangeStatusModal({ emp, onClose, onSaved }) {
  const isActive = emp.status === "ACTIVE";
  const [choice, setChoice] = useState(isActive ? "ACTIVE" : "DISABLED");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = [
    { key: "ACTIVE", label: "Active", desc: "Employee can login and track attendance.", Icon: UserCheck, cls: "green" },
    { key: "DISABLED", label: "Inactive", desc: "Employee cannot login.", Icon: UserX, cls: "red" },
  ];
  const save = async () => {
    if (choice === (isActive ? "ACTIVE" : "DISABLED")) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/employees/${emp.id}/status/`, { action: choice === "ACTIVE" ? "enable" : "disable" });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update the status."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Change Employee Status" onClose={onClose}>
      <Person emp={emp} subtitle={emp.employee_code} badge={<StatusChip active={isActive} />} />
      <Alert>{error}</Alert>
      <div className="ea-section-title">Select New Status</div>
      <div className="ea-options">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`ea-option ${o.cls}${choice === o.key ? " on" : ""}`}
            onClick={() => setChoice(o.key)}
          >
            <span className="ea-radio" />
            <o.Icon size={16} />
            <span>
              <b>{o.label}</b>
              <small>{o.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <label className="ea-label">Reason (Optional)</label>
      <textarea
        className="input"
        rows={3}
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Enter reason for status change…"
      />
      <div className="ea-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Updating…" : "Update Status"}
        </button>
      </div>
    </Modal>
  );
}

export function ResetPasswordModal({ emp, onClose }) {
  const [mode, setMode] = useState("send_link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/employees/${emp.id}/reset-password/`, { mode });
      setResult(data || {});
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't reset the password."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Reset Password" onClose={onClose}>
      <Person emp={emp} subtitle={`${emp.employee_code} · ${emp.user?.phone || ""}`} badge={<StatusChip active={emp.status === "ACTIVE"} />} />
      <Alert>{error}</Alert>
      {result ? (
        <div className="ea-success">
          {result.temporary_password ? (
            <>
              <div>Share this temporary password with the employee. They will be asked to change it on first login.</div>
              <code className="ea-code">{result.temporary_password}</code>
            </>
          ) : (
            <div>{result.detail || "A password reset link has been sent to the employee."}</div>
          )}
          <div className="ea-footer">
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <div className="ea-note">
            <Lock size={16} />
            <span>A password reset will be sent to the employee's registered phone number.</span>
          </div>
          <div className="ea-options">
            <button type="button" className={`ea-option green${mode === "send_link" ? " on" : ""}`} onClick={() => setMode("send_link")}>
              <span className="ea-radio" />
              <span>
                <b>Send reset link</b>
                <small>The employee sets their own new password.</small>
              </span>
            </button>
            <button type="button" className={`ea-option${mode === "temporary_password" ? " on" : ""}`} onClick={() => setMode("temporary_password")}>
              <span className="ea-radio" />
              <span>
                <b>Generate temporary password</b>
                <small>You get a one-time password to share. Forced change on next login.</small>
              </span>
            </button>
          </div>
          <div className="ea-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
              {busy ? "Working…" : "Generate & Send"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ViewLocationModal({ emp, live, onClose }) {
  const { isLoaded, loadError } = useJsApiLoader(MAPS_OPTIONS);
  const hasPos = live?.last_latitude != null && live?.last_longitude != null;
  const pos = hasPos ? { lat: live.last_latitude, lng: live.last_longitude } : null;
  return (
    <Modal title="View Location" onClose={onClose} wide>
      <Person
        emp={emp}
        subtitle={emp.employee_code}
        badge={<span className={`ea-chip ${live?.is_online ? "ok" : "off"}`}>{live?.is_online ? "Live" : "Offline"}</span>}
      />
      <div className="ea-map">
        {!hasPos ? (
          <div className="ea-map-msg">No location yet for this employee.</div>
        ) : loadError ? (
          <div className="ea-map-msg">Google Maps couldn't load. Check the Maps API key.</div>
        ) : !isLoaded ? (
          <div className="ea-map-msg">Loading map…</div>
        ) : (
          <GoogleMap mapContainerStyle={{ height: "100%", width: "100%" }} center={pos} zoom={16} options={{ streetViewControl: false, mapTypeControl: false }}>
            <Marker position={pos} title={emp.user?.full_name} />
          </GoogleMap>
        )}
      </div>
      <div className="ea-stats">
        <Info label="Last Update" value={live?.minutes_since_last_ping != null ? `${live.minutes_since_last_ping} min ago` : "—"} Icon={Clock} />
        <Info label="Work Area" value={live?.current_work_area_name || "Outside work area"} Icon={MapPin} />
        <Info label="Battery" value="Not tracked yet" Icon={Battery} />
        <Info label="Network" value="Not tracked yet" Icon={Wifi} />
        <Info label="Accuracy" value={live?.accuracy_meters != null ? `±${Math.round(live.accuracy_meters)} m` : "Not tracked yet"} Icon={Navigation} />
      </div>
    </Modal>
  );
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--";
}

function fmtMinutes(m) {
  const n = Number(m) || 0;
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m`;
}

export function AttendanceHistoryModal({ emp, onClose }) {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
  const [to, setTo] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get("/attendance/records/", { params: { employee: emp.id, page_size: 500 } })
      .then(({ data }) => setRows(data.results || data || []))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load attendance.")))
      .finally(() => setLoading(false));
  }, [emp.id]);

  const shown = rows.filter((r) => r.date >= from && r.date <= to);
  const present = shown.filter((r) => r.check_in_time).length;
  const late = shown.filter((r) => r.is_late).length;
  const halfDay = shown.filter((r) => r.status === "HALF_DAY").length;
  const absent = shown.filter((r) => r.status === "ABSENT").length;
  const perPage = 5;
  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const slice = shown.slice((page - 1) * perPage, page * perPage);

  const card = (label, value, cls, Icon) => (
    <div className={`ea-stat ${cls}`}>
      <Icon size={16} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );

  return (
    <Modal title="Attendance History" onClose={onClose} wide>
      <Person emp={emp} subtitle={emp.employee_code} />
      <div className="ea-range">
        <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span>to</span>
        <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>
      <Alert>{error}</Alert>
      <div className="ea-stat-row">
        {card("Present", present, "green", UserCheck)}
        {card("Late", late, "amber", Clock)}
        {card("Half Day", halfDay, "blue", Clock)}
        {card("Absent", absent, "red", UserX)}
      </div>
      {loading ? (
        <div className="ea-map-msg">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="ea-map-msg">No attendance in this period.</div>
      ) : (
        <>
          <table className="data ea-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Work Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{fmtTime(r.check_in_time)}</td>
                  <td>{fmtTime(r.check_out_time)}</td>
                  <td>{fmtMinutes(r.working_minutes)}</td>
                  <td>
                    <span className={`ea-chip ${r.is_late ? "warn" : r.check_in_time ? "ok" : "off"}`}>
                      {r.is_late ? "Late" : r.check_in_time ? "Present" : r.status || "Absent"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ea-pager">
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
      <div className="ea-footer">
        <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

export function DisableEmployeeModal({ emp, onClose, onSaved }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post(`/employees/${emp.id}/status/`, { action: "disable" });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't disable this employee."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Disable Employee" onClose={onClose}>
      <Person emp={emp} subtitle={emp.employee_code} />
      <Alert>{error}</Alert>
      <div className="ea-danger">
        Employees can't be permanently deleted. Disabling blocks login and keeps the attendance history.
      </div>
      <label className="ea-label">Reason (Required)</label>
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">Select reason</option>
        <option value="LEFT">Left the company</option>
        <option value="ACCESS">Access no longer needed</option>
        <option value="OTHER">Other</option>
      </select>
      <label className="ea-label">Additional details</label>
      <textarea className="input" rows={3} maxLength={200} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Enter additional details…" />
      <div className="ea-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn ea-btn-danger" onClick={submit} disabled={saving || !reason}>
          {saving ? "Disabling…" : "Disable Employee"}
        </button>
      </div>
    </Modal>
  );
}
