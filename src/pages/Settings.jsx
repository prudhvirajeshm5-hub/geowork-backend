import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Users as UsersIcon, Clock3, ArrowRight } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, EmptyState, Field, Loading, StatusBadge } from "../components/ui";

const TABS = ["General", "Attendance", "Users & Roles", "Security"];

export default function Settings() {
  const [tab, setTab] = useState("General");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Account</div>
          <h1>Settings</h1>
          <p className="page-sub">Your profile, org-wide attendance rules, roles, and account security.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "General" && <GeneralTab />}
      {tab === "Attendance" && <AttendanceTab />}
      {tab === "Users & Roles" && <UsersTab />}
      {tab === "Security" && <SecurityTab />}
    </div>
  );
}

/* ---------------------------------- General ---------------------------------- */

function GeneralTab() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name || "", last_name: user.last_name || "", email: user.email || "" });
  }, [user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch("/auth/me/", form);
      await refreshUser();
      setSuccess("Profile updated.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <Loading />;

  return (
    <div className="card card-pad" style={{ maxWidth: 560 }}>
      <Alert>{error}</Alert>
      <Alert tone="info">{success}</Alert>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="First name">
            <input className="input" value={form.first_name} onChange={set("first_name")} required />
          </Field>
          <Field label="Last name">
            <input className="input" value={form.last_name} onChange={set("last_name")} />
          </Field>
          <Field label="Phone" hint="Contact your company admin to change your phone number.">
            <input className="input" value={user.phone} disabled />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" />
          </Field>
          <Field label="Role">
            <input className="input" value={user.role} disabled />
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------- Attendance ---------------------------------- */

function AttendanceTab() {
  const [shifts, setShifts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/company/shifts/", { params: { page_size: 200 } })
      .then(({ data }) => setShifts(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load shift configuration.")));
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Attendance rules by shift</h3>
          <div className="card-head-sub">
            Grace period, half-day and full-day thresholds — each shift carries its own rule set, applied automatically
            when attendance is marked from geofence entry/exit.
          </div>
        </div>
        <Link to="/company" className="btn btn-sm">
          Edit in Company Setup <ArrowRight size={13} />
        </Link>
      </div>

      <Alert>{error}</Alert>

      {shifts === null ? (
        <Loading />
      ) : shifts.length === 0 ? (
        <EmptyState icon={Clock3} title="No shifts configured" message="Add a shift under Company Setup to define grace period and working-day rules." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Start</th>
                <th>End</th>
                <th>Grace period</th>
                <th>Half day after</th>
                <th>Full day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="cell-primary">{s.name}</td>
                  <td className="mono">{s.start_time}</td>
                  <td className="mono">{s.end_time}</td>
                  <td>{s.grace_period_minutes} min</td>
                  <td>{s.half_day_after_minutes} min</td>
                  <td>{s.full_day_minutes} min</td>
                  <td>
                    <StatusBadge tone={s.is_active ? "green" : "slate"}>{s.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="hint">
          Automatic check-in and check-out are always driven by geofence entry/exit — there's no separate on/off switch
          for this in the current backend; it follows directly from whether an employee has an assigned work area.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- Users & Roles ---------------------------------- */

function UsersTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/employees/", { params: { page_size: 200 } })
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load users.")));
  }, []);

  const roleTone = { ADMIN: "blue", MANAGER: "amber", EMPLOYEE: "slate" };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Users &amp; roles</h3>
          <div className="card-head-sub">Every login account and its role, read from the employee directory.</div>
        </div>
        <Link to="/employees" className="btn btn-sm">
          <UsersIcon size={13} /> Manage in Employees
        </Link>
      </div>

      <Alert>{error}</Alert>

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" message="Add employees to create their login accounts." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-primary">{r.user?.full_name}</td>
                  <td className="mono">{r.user?.phone}</td>
                  <td className="mono">{r.employee_code}</td>
                  <td>
                    <StatusBadge tone={roleTone[r.user?.role] || "slate"}>{r.user?.role}</StatusBadge>
                  </td>
                  <td>
                    <StatusBadge tone={r.status === "ACTIVE" ? "green" : "slate"}>{r.status}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Security ---------------------------------- */

function SecurityTab() {
  const { user } = useAuth();
  const [step, setStep] = useState("request"); // 'request' | 'confirm' | 'done'
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestOtp = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/password/forgot/", { phone: user.phone });
      setStep("confirm");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send a reset code."));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReset = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/password/reset/", { phone: user.phone, code, new_password: newPassword });
      setStep("done");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't reset your password. Check the code and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <ShieldCheck size={18} color="var(--brand)" />
        <h3 style={{ fontSize: 15 }}>Reset your password</h3>
      </div>

      <Alert>{error}</Alert>

      {step === "request" && (
        <>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 16 }}>
            We'll send a one-time code by SMS to <strong>{user?.phone}</strong> to verify it's you.
          </p>
          <button className="btn btn-primary" disabled={submitting} onClick={requestOtp}>
            {submitting ? "Sending…" : "Send reset code"}
          </button>
        </>
      )}

      {step === "confirm" && (
        <form onSubmit={confirmReset}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Verification code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>New password</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn" onClick={() => setStep("request")}>
              Back
            </button>
            <button className="btn btn-primary" disabled={submitting}>
              {submitting ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <Alert tone="info">Password reset. Use it next time you sign in.</Alert>
      )}
    </div>
  );
}
