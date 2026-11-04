import { useEffect, useState } from "react";
import { Building2, Pencil, Plus, Search } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, EmptyState, Field, Loading, Modal, StatusBadge } from "../components/ui";
import "../company-setup.css";

const TABS = ["Profile", "Branches", "Departments", "Designations", "Shifts"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CompanySetup() {
  const [tab, setTab] = useState("Profile");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 2</div>
          <h1>Company Setup</h1>
          <p className="page-sub">Manage your organisation structure and settings.</p>
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
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    registered_address: "",
    gstin: "",
    contact_email: "",
    contact_phone: "",
    timezone: "Asia/Kolkata",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const fillForm = (data) => {
    setCompany(data || null);
    setForm({
      name: data?.name || "",
      registered_address: data?.registered_address || "",
      gstin: data?.gstin || "",
      contact_email: data?.contact_email || "",
      contact_phone: data?.contact_phone || "",
      timezone: data?.timezone || "Asia/Kolkata",
    });
    setSelectedCompanyId(data?.id ? String(data.id) : "");
    setEditing(!data);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadCompany() {
      setLoading(true);
      setError("");
      try {
        if (user?.company) {
          const { data } = await api.get(`/company/companies/${user.company}/`);
          if (!cancelled) {
            setCompanies([data]);
            fillForm(data);
            setEditing(false);
          }
        } else {
          // Platform superusers may have existing companies even when their
          // own account is not assigned to a tenant. Load those instead of
          // showing an empty registration form and hiding existing details.
          const { data } = await api.get("/company/companies/", { params: { page_size: 200 } });
          const list = Array.isArray(data) ? data : (data.results || []);
          if (!cancelled) {
            setCompanies(list);
            if (list.length === 1) {
              fillForm(list[0]);
              setEditing(false);
            } else if (list.length > 1) {
              // Avoid silently editing the wrong tenant when a platform admin
              // has access to multiple companies.
              const first = list[0];
              fillForm(first);
              setEditing(false);
            } else {
              fillForm(null);
              setEditing(true);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Could not load company details."));
          fillForm(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCompany();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company, user?.email, user?.phone]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const chooseCompany = (event) => {
    const id = event.target.value;
    setSelectedCompanyId(id);
    const selected = companies.find((item) => String(item.id) === id);
    if (selected) {
      fillForm(selected);
      setEditing(false);
      setError("");
      setSuccess("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const companyName = form.name.trim();
    const generatedSlug = companyName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const payload = {
      name: companyName,
      slug: generatedSlug,
      registered_address: form.registered_address.trim(),
      gstin: form.gstin.trim(),
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim(),
      timezone: form.timezone.trim() || "Asia/Kolkata",
    };

    try {
      let data;
      if (company?.id) {
        const response = await api.patch(`/company/companies/${company.id}/`, payload);
        data = response.data;
        setSuccess("Company profile updated successfully.");
      } else {
        const response = await api.post("/company/companies/", payload);
        data = response.data;
        setSuccess("Company registered successfully.");
        setCompanies((current) => [...current, data]);
      }
      fillForm(data);
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err, company?.id ? "Couldn't update the company profile." : "Couldn't register the company."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label="Loading company profile…" />;

  const hasMultipleCompanies = !user?.company && companies.length > 1;

  return (
    <div className="card card-pad cp-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{company ? "Company Profile" : "Register your company"}</h2>
          <p className="page-sub">
            {company ? "Your registered company information and contact details." : "Enter your company details to set up your GeoWork Pro workspace."}
          </p>
        </div>
        {company && !editing && (
          <button type="button" className="btn btn-primary" onClick={() => { setEditing(true); setError(""); setSuccess(""); }}>
            <Pencil size={14} /> Edit Profile
          </button>
        )}
      </div>

      {hasMultipleCompanies && (
        <div style={{ marginBottom: 16, maxWidth: 420 }}>
          <Field label="Company to view or edit">
            <select className="input" value={selectedCompanyId} onChange={chooseCompany}>
              {companies.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
            </select>
          </Field>
          <p className="page-sub">Your platform admin account can access multiple companies. Choose the correct company before editing.</p>
        </div>
      )}

      <Alert>{error}</Alert>
      {success && <Alert tone="info">{success}</Alert>}

      {!editing && company ? (
        <div className="cp-layout">
          <div className="cp-logo">
            <div className="cp-logo-mark">
              <Building2 size={36} />
            </div>
            <button type="button" className="cp-logo-btn" disabled title="Logo upload is not available yet">
              Change Logo
            </button>
            <div className="cp-hint">JPG, PNG (Max 2MB)</div>
          </div>
          <div className="cp-fields">
            <div className="form-grid">
              <Field label="Company Name *"><input className="input" value={company.name || ""} readOnly /></Field>
              <Field label="Company Slug *"><input className="input" value={company.slug || ""} readOnly /></Field>
              <Field label="Contact Email *"><input className="input" value={company.contact_email || ""} readOnly /></Field>
              <Field label="Contact Phone *"><input className="input" value={company.contact_phone || ""} readOnly /></Field>
              <Field label="GSTIN"><input className="input" value={company.gstin || ""} readOnly /></Field>
              <Field label="Timezone"><input className="input" value={company.timezone || "Asia/Kolkata"} readOnly /></Field>
              <div className="cp-full">
                <Field label="Registered Address *">
                  <textarea className="input" rows={4} value={company.registered_address || ""} readOnly />
                </Field>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <Field label="Company name">
              <input className="input" required maxLength={255} placeholder="Enter registered company name" value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Contact phone">
              <input className="input" type="tel" placeholder="+91 98765 43210" value={form.contact_phone} onChange={set("contact_phone")} />
            </Field>
            <Field label="Contact email">
              <input className="input" type="email" placeholder="admin@company.com" value={form.contact_email} onChange={set("contact_email")} />
            </Field>
            <Field label="GSTIN">
              <input className="input" maxLength={20} placeholder="GST identification number (optional)" value={form.gstin} onChange={set("gstin")} />
            </Field>
            <Field label="Timezone">
              <select className="input" value={form.timezone} onChange={set("timezone")}>
                <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                <option value="UTC">UTC</option>
                <option value="Asia/Dubai">Dubai (Asia/Dubai)</option>
                <option value="Asia/Singapore">Singapore (Asia/Singapore)</option>
                <option value="Europe/London">London (Europe/London)</option>
                <option value="America/New_York">New York (America/New_York)</option>
              </select>
            </Field>
            <Field label="Registered address">
              <textarea className="input" rows={3} placeholder="Enter registered office address" value={form.registered_address} onChange={set("registered_address")} />
            </Field>
          </div>
          <div className="form-actions" style={{ justifyContent: "flex-start", gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : company ? "Save changes" : "Register company"}
            </button>
            {company && <button type="button" className="btn btn-secondary" onClick={() => { fillForm(company); setEditing(false); setError(""); }}>Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------------------------- Branches ---------------------------------- */

function BranchesTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    api
      .get("/company/branches/", { params: { page_size: 200 } })
      .then(({ data }) => setRows(data.results || data))
      .catch((err) => setError(apiErrorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const all = rows || [];
  const activeCount = all.filter((b) => b.is_active).length;
  const inactiveCount = all.length - activeCount;
  const q = query.trim().toLowerCase();
  const shown = all.filter((b) => {
    const hit = !q || [b.name, b.code, b.city].some((v) => String(v || "").toLowerCase().includes(q));
    const st = !status || (status === "active" ? b.is_active : !b.is_active);
    return hit && st;
  });

  const stat = (label, value, tone) => (
    <div className="cs-stat">
      <span className={`cs-stat-icon cs-tone-${tone}`}>
        <Building2 size={18} />
      </span>
      <div>
        <div className="cs-stat-label">{label}</div>
        <div className="cs-stat-value">{value}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="cs-tab-head">
        <div>
          <h2 className="cs-tab-title">Branches</h2>
          <p className="cs-tab-sub">Manage all your company branches and locations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Add Branch
        </button>
      </div>

      <div className="cs-stats">
        {stat("Total Branches", all.length, "blue")}
        {stat("Active Branches", activeCount, "green")}
        {stat("Inactive Branches", inactiveCount, "red")}
      </div>

      <div className="card cs-card">
        <Alert>{error}</Alert>
        <div className="cs-filters">
          <div className="cs-search">
            <Search size={15} />
            <input
              placeholder="Search branch name, code or city..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {rows === null ? (
          <Loading />
        ) : all.length === 0 ? (
          <EmptyState icon={Building2} title="No branches yet" message="Add your first site or office to start assigning employees to it." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Branch Name</th>
                    <th>Branch Code</th>
                    <th>City</th>
                    <th>State</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b, i) => (
                    <tr key={b.id}>
                      <td>{i + 1}</td>
                      <td className="cell-primary">{b.name}</td>
                      <td className="mono">{b.code || "—"}</td>
                      <td>{b.city || "—"}</td>
                      <td>{b.state || "—"}</td>
                      <td>
                        <StatusBadge tone={b.is_active ? "green" : "slate"}>{b.is_active ? "Active" : "Inactive"}</StatusBadge>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-icon" title="Edit" onClick={() => setEditing(b)}>
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cs-footer">
              Showing {shown.length} of {all.length} branches
            </div>
          </>
        )}
      </div>

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
      <div className="cs-tab-head">
        <div>
          <h2 className="cs-tab-title">Departments</h2>
          <p className="cs-tab-sub">Manage departments within your organisation.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Add department
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
      <div className="cs-footer">Showing {rows?.length ?? 0} departments</div>
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
      <div className="cs-tab-head">
        <div>
          <h2 className="cs-tab-title">Designations</h2>
          <p className="cs-tab-sub">Manage employee designations and hierarchy levels.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Add designation
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
      <div className="cs-footer">Showing {rows?.length ?? 0} designations</div>
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
      <div className="cs-tab-head">
        <div>
          <h2 className="cs-tab-title">Shifts</h2>
          <p className="cs-tab-sub">Manage working shifts and timing for your organisation.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Add shift
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
      <div className="cs-footer">Showing {rows?.length ?? 0} shifts</div>
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
