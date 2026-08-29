import { useEffect, useState } from "react";
import { Plus, Pencil, Building2 } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, EmptyState, Field, Loading, Modal, StatusBadge } from "../components/ui";

const TABS = ["Profile", "Branches", "Departments", "Designations", "Shifts"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CompanySetup() {
  const [tab, setTab] = useState("Profile");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 2</div>
          <h1>Company setup</h1>
          <p className="page-sub">Branches, departments, designations and shift timing — the org structure everything else hangs off.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" && <ProfileTab />}
      {tab === "Branches" && <BranchesTab />}
      {tab === "Departments" && <DepartmentsTab />}
      {tab === "Designations" && <DesignationsTab />}
      {tab === "Shifts" && <ShiftsTab />}
    </div>
  );
}

/* ---------------------------------- Profile ---------------------------------- */

function ProfileTab() {
  const { user, refreshUser } = useAuth();

  // A user with no company yet (fresh ADMIN-role account, nothing set up
  // in Django admin) sets up their company right here — no separate
  // "assign company to user" step needed. See CompanyViewSet.perform_create.
  if (!user?.company) {
    return <CreateCompanyForm onCreated={refreshUser} />;
  }

  return <EditCompanyForm companyId={user.company} />;
}

function CreateCompanyForm({ onCreated }) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contact_email: "",
    contact_phone: "",
    gstin: "",
    timezone: "Asia/Kolkata",
    registered_address: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      [k]: value,
      // Keep the slug in sync with the name until the person edits the
      // slug field directly themselves.
      slug: k === "name" && !slugTouched ? slugify(value) : f.slug,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/company/companies/", form);
      await onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't set up the company."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Set up your company</h3>
        <p className="card-head-sub" style={{ marginTop: 4 }}>
          This account isn't tied to a company yet. Fill this in once to get started — you'll be able to add branches, departments and shifts right after.
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Company name">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Slug" hint="Used internally to identify your company">
            <input
              className="input"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug")(e);
              }}
            />
          </Field>
          <Field label="Contact email">
            <input className="input" type="email" value={form.contact_email} onChange={set("contact_email")} />
          </Field>
          <Field label="Contact phone">
            <input className="input" value={form.contact_phone} onChange={set("contact_phone")} />
          </Field>
          <Field label="GSTIN">
            <input className="input" value={form.gstin} onChange={set("gstin")} />
          </Field>
          <Field label="Timezone">
            <input className="input" value={form.timezone} onChange={set("timezone")} />
          </Field>
        </div>
        <div className="form-grid cols-1" style={{ marginTop: 14 }}>
          <Field label="Registered address">
            <textarea className="input" value={form.registered_address} onChange={set("registered_address")} />
          </Field>
        </div>
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Setting up…" : "Create company"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditCompanyForm({ companyId }) {
  const [company, setCompany] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get(`/company/companies/${companyId}/`)
      .then(({ data }) => {
        setCompany(data);
        setForm(data);
      })
      .catch((err) => {
        // Previously this had no .catch() at all: any failed request (403,
        // 404, network error) left `form` as null forever, so the page was
        // stuck on the loading spinner indefinitely with zero indication
        // anything had gone wrong.
        setError(apiErrorMessage(err, "Couldn't load the company profile."));
      });
  }, [companyId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.patch(`/company/companies/${company.id}/`, {
        name: form.name,
        registered_address: form.registered_address,
        gstin: form.gstin,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        timezone: form.timezone,
      });
      setCompany(data);
      setForm(data);
      setSuccess("Company profile updated.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the company profile."));
    } finally {
      setSaving(false);
    }
  };

  if (!form && !error) return <Loading label="Loading company profile…" />;
  if (!form && error) {
    return (
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <Alert>{error}</Alert>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        {success && <Alert tone="info">{success}</Alert>}
        <div className="form-grid">
          <Field label="Company name">
            <input className="input" required value={form.name || ""} onChange={set("name")} />
          </Field>
          <Field label="Plan" hint="Managed by GeoWork Pro">
            <input className="input" value={form.plan || ""} disabled />
          </Field>
          <Field label="Contact email">
            <input className="input" type="email" value={form.contact_email || ""} onChange={set("contact_email")} />
          </Field>
          <Field label="Contact phone">
            <input className="input" value={form.contact_phone || ""} onChange={set("contact_phone")} />
          </Field>
          <Field label="GSTIN">
            <input className="input" value={form.gstin || ""} onChange={set("gstin")} />
          </Field>
          <Field label="Timezone">
            <input className="input" value={form.timezone || ""} onChange={set("timezone")} />
          </Field>
        </div>
        <div className="form-grid cols-1" style={{ marginTop: 14 }}>
          <Field label="Registered address">
            <textarea className="input" value={form.registered_address || ""} onChange={set("registered_address")} />
          </Field>
        </div>
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------- Branches ---------------------------------- */

function BranchesTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () =>
    api
      .get("/company/branches/", { params: { page_size: 200 } })
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card">
      <div className="table-toolbar">
        <span className="card-head-sub">{rows?.length ?? 0} branches</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Add branch
        </button>
      </div>
      <Alert>{error}</Alert>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title="No branches yet" message="Add your first site or office to start assigning employees to it." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>City</th>
                <th>State</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="cell-primary">{b.name}</td>
                  <td className="mono">{b.code || "—"}</td>
                  <td>{b.city || "—"}</td>
                  <td>{b.state || "—"}</td>
                  <td>
                    <StatusBadge tone={b.is_active ? "green" : "slate"}>{b.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-icon" onClick={() => setEditing(b)}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <BranchModal
          branch={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BranchModal({ branch, onClose, onSaved }) {
  const [form, setForm] = useState(
    branch || { name: "", code: "", address: "", city: "", state: "", country: "India", is_active: true }
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (branch) await api.patch(`/company/branches/${branch.id}/`, form);
      else await api.post("/company/branches/", form);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={branch ? "Edit branch" : "Add branch"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Branch name">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Short code">
            <input className="input" value={form.code} onChange={set("code")} />
          </Field>
          <Field label="City">
            <input className="input" value={form.city} onChange={set("city")} />
          </Field>
          <Field label="State">
            <input className="input" value={form.state} onChange={set("state")} />
          </Field>
          <Field label="Country">
            <input className="input" value={form.country} onChange={set("country")} />
          </Field>
          <Field label="Status">
            <select className="input" value={form.is_active ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "1" }))}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="form-grid cols-1" style={{ marginTop: 14 }}>
          <Field label="Address">
            <textarea className="input" value={form.address} onChange={set("address")} />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save branch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- Departments ---------------------------------- */

function DepartmentsTab() {
  const [rows, setRows] = useState(null);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get("/company/departments/", { params: { page_size: 200 } }).then(({ data }) => setRows(data.results || data)).catch((err) => setError(apiErrorMessage(err)));
  };

  useEffect(() => {
    load();
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data));
  }, []);

  return (
    <div className="card">
      <div className="table-toolbar">
        <span className="card-head-sub">{rows?.length ?? 0} departments</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Add department
        </button>
      </div>
      <Alert>{error}</Alert>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No departments yet" message="Group employees by function, e.g. Operations, Warehouse, Sales." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Branch</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="cell-primary">{d.name}</td>
                  <td>{branches.find((b) => b.id === d.branch)?.name || "All branches"}</td>
                  <td>
                    <StatusBadge tone={d.is_active ? "green" : "slate"}>{d.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-icon" onClick={() => setEditing(d)}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(creating || editing) && (
        <DepartmentModal
          department={editing}
          branches={branches}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DepartmentModal({ department, branches, onClose, onSaved }) {
  const [form, setForm] = useState(department || { name: "", branch: "", description: "", is_active: true });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form, branch: form.branch || null };
      if (department) await api.patch(`/company/departments/${department.id}/`, payload);
      else await api.post("/company/departments/", payload);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={department ? "Edit department" : "Add department"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Department name">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Branch" hint="Leave blank to apply company-wide">
            <select className="input" value={form.branch || ""} onChange={set("branch")}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid cols-1" style={{ marginTop: 14 }}>
          <Field label="Description">
            <textarea className="input" value={form.description} onChange={set("description")} />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save department"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- Designations ---------------------------------- */

function DesignationsTab() {
  const [rows, setRows] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get("/company/designations/", { params: { page_size: 200 } }).then(({ data }) => setRows(data.results || data)).catch((err) => setError(apiErrorMessage(err)));
  };

  useEffect(() => {
    load();
    api.get("/company/departments/", { params: { page_size: 200 } }).then(({ data }) => setDepartments(data.results || data));
  }, []);

  return (
    <div className="card">
      <div className="table-toolbar">
        <span className="card-head-sub">{rows?.length ?? 0} designations</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Add designation
        </button>
      </div>
      <Alert>{error}</Alert>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No designations yet" message="Define job titles like Site Supervisor or Field Technician." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th>Level</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="cell-primary">{d.title}</td>
                  <td>{departments.find((dep) => dep.id === d.department)?.name || "—"}</td>
                  <td className="mono">{d.level}</td>
                  <td>
                    <StatusBadge tone={d.is_active ? "green" : "slate"}>{d.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-icon" onClick={() => setEditing(d)}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(creating || editing) && (
        <DesignationModal
          designation={editing}
          departments={departments}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DesignationModal({ designation, departments, onClose, onSaved }) {
  const [form, setForm] = useState(designation || { title: "", department: "", level: 3, is_active: true });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form, department: form.department || null, level: Number(form.level) };
      if (designation) await api.patch(`/company/designations/${designation.id}/`, payload);
      else await api.post("/company/designations/", payload);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={designation ? "Edit designation" : "Add designation"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Title">
            <input className="input" required value={form.title} onChange={set("title")} />
          </Field>
          <Field label="Seniority level" hint="1 = most senior">
            <input className="input" type="number" min="1" value={form.level} onChange={set("level")} />
          </Field>
          <Field label="Department">
            <select className="input" value={form.department || ""} onChange={set("department")}>
              <option value="">Unassigned</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save designation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- Shifts ---------------------------------- */

function ShiftsTab() {
  const [rows, setRows] = useState(null);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get("/company/shifts/", { params: { page_size: 200 } }).then(({ data }) => setRows(data.results || data)).catch((err) => setError(apiErrorMessage(err)));
  };

  useEffect(() => {
    load();
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data));
  }, []);

  return (
    <div className="card">
      <div className="table-toolbar">
        <span className="card-head-sub">{rows?.length ?? 0} shifts</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Add shift
        </button>
      </div>
      <Alert>{error}</Alert>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No shifts yet" message="Define a shift's timing, grace period and working days." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Timing</th>
                <th>Grace</th>
                <th>Working days</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="cell-primary">
                    {s.name}
                    {s.is_night_shift && (
                      <span className="cell-sub" style={{ marginLeft: 6 }}>
                        Night
                      </span>
                    )}
                  </td>
                  <td className="mono">
                    {s.start_time}–{s.end_time}
                  </td>
                  <td>{s.grace_period_minutes}m</td>
                  <td>
                    <div className="pill-group">
                      {WEEKDAYS.map((w, i) => {
                        const wd = s.working_days?.find((x) => x.weekday === i);
                        return (
                          <span key={i} className={`pill-toggle ${wd?.is_working ? "on" : ""}`} style={{ cursor: "default", padding: "3px 6px" }}>
                            {w[0]}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone={s.is_active ? "green" : "slate"}>{s.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-icon" onClick={() => setEditing(s)}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(creating || editing) && (
        <ShiftModal
          shift={editing}
          branches={branches}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ShiftModal({ shift, branches, onClose, onSaved }) {
  const [form, setForm] = useState(
    shift
      ? { ...shift }
      : {
          name: "",
          branch: "",
          start_time: "09:00",
          end_time: "18:00",
          is_night_shift: false,
          grace_period_minutes: 10,
          half_day_after_minutes: 240,
          full_day_minutes: 480,
          is_active: true,
        }
  );
  const [workingDays, setWorkingDays] = useState(() => {
    const base = Array(7).fill(true);
    (shift?.working_days || []).forEach((wd) => {
      base[wd.weekday] = wd.is_working;
    });
    return base;
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleDay = (i) => setWorkingDays((wd) => wd.map((v, idx) => (idx === i ? !v : v)));

  const syncWorkingDays = async (shiftId) => {
    const existing = shift?.working_days || [];
    await Promise.all(
      workingDays.map((isWorking, weekday) => {
        const current = existing.find((wd) => wd.weekday === weekday);
        if (current) {
          if (current.is_working === isWorking) return Promise.resolve();
          return api.patch(`/company/working-days/${current.id}/`, { is_working: isWorking });
        }
        return api.post("/company/working-days/", { shift: shiftId, weekday, is_working: isWorking });
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        branch: form.branch || null,
        start_time: form.start_time,
        end_time: form.end_time,
        is_night_shift: form.is_night_shift,
        grace_period_minutes: Number(form.grace_period_minutes),
        half_day_after_minutes: Number(form.half_day_after_minutes),
        full_day_minutes: Number(form.full_day_minutes),
        is_active: form.is_active,
      };
      let shiftId = shift?.id;
      if (shift) {
        await api.patch(`/company/shifts/${shift.id}/`, payload);
      } else {
        const { data } = await api.post("/company/shifts/", payload);
        shiftId = data.id;
      }
      await syncWorkingDays(shiftId);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={shift ? "Edit shift" : "Add shift"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Shift name">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Branch">
            <select className="input" value={form.branch || ""} onChange={set("branch")}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start time">
            <input className="input" type="time" required value={form.start_time?.slice(0, 5)} onChange={set("start_time")} />
          </Field>
          <Field label="End time">
            <input className="input" type="time" required value={form.end_time?.slice(0, 5)} onChange={set("end_time")} />
          </Field>
          <Field label="Grace period (minutes)">
            <input className="input" type="number" min="0" value={form.grace_period_minutes} onChange={set("grace_period_minutes")} />
          </Field>
          <Field label="Half-day threshold (minutes)">
            <input className="input" type="number" min="0" value={form.half_day_after_minutes} onChange={set("half_day_after_minutes")} />
          </Field>
          <Field label="Full-day minutes">
            <input className="input" type="number" min="0" value={form.full_day_minutes} onChange={set("full_day_minutes")} />
          </Field>
        </div>

        <div className="checkbox-row" style={{ marginTop: 14 }}>
          <input type="checkbox" id="night" checked={form.is_night_shift} onChange={(e) => setForm((f) => ({ ...f, is_night_shift: e.target.checked }))} />
          <label htmlFor="night">Overnight shift (end time falls the next day)</label>
        </div>

        <hr className="divider-dash" />
        <Field label="Working days">
          <div className="pill-group">
            {WEEKDAYS.map((w, i) => (
              <button type="button" key={i} className={`pill-toggle ${workingDays[i] ? "on" : ""}`} onClick={() => toggleDay(i)}>
                {w}
              </button>
            ))}
          </div>
        </Field>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save shift"}
          </button>
        </div>
      </form>
    </Modal>
  );
}