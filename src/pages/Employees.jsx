import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, UserX, UserCheck, Pencil, Users, ArrowLeftRight, PlaneTakeoff } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, ConfirmDialog, EmptyState, Field, Loading, Modal, NoResults, Pager, SearchBox, StatusBadge } from "../components/ui";
import { debounce, formatDate, initials } from "../lib/format";

const PAGE_SIZE = 20;

export default function Employees() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [lookups, setLookups] = useState({ branches: [], departments: [], designations: [], shifts: [], employees: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [outdoorDuty, setOutdoorDuty] = useState(null);

  const debouncedSetSearch = useMemo(() => debounce((v) => { setPage(1); setSearch(v); }, 350), []);

  useEffect(() => {
    Promise.all([
      api.get("/company/branches/", { params: { page_size: 200 } }),
      api.get("/company/departments/", { params: { page_size: 200 } }),
      api.get("/company/designations/", { params: { page_size: 200 } }),
      api.get("/company/shifts/", { params: { page_size: 200 } }),
      api.get("/employees/", { params: { page_size: 200 } }),
    ]).then(([b, d, des, s, e]) => {
      setLookups({
        branches: b.data.results || b.data,
        departments: d.data.results || d.data,
        designations: des.data.results || des.data,
        shifts: s.data.results || s.data,
        employees: e.data.results || e.data,
      });
    });
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (branchFilter) params.branch = branchFilter;
      const { data } = await api.get("/employees/", { params });
      setRows(data.results || data);
      setCount(data.count ?? (data.results || data).length);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load employees."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, branchFilter]);

  const refreshLookupEmployees = async () => {
    const { data } = await api.get("/employees/", { params: { page_size: 200 } });
    setLookups((prev) => ({ ...prev, employees: data.results || data }));
  };

  const handleStatusToggle = async () => {
    const action = statusTarget.status === "ACTIVE" ? "disable" : "enable";
    try {
      await api.post(`/employees/${statusTarget.id}/status/`, { action });
      setStatusTarget(null);
      load();
      refreshLookupEmployees();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update that employee's status."));
      setStatusTarget(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 3</div>
          <h1>Employees</h1>
          <p className="page-sub">Onboard field staff and keep their org details current.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} />
          Add employee
        </button>
      </div>

      <Alert>{error}</Alert>

      <div className="card">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <SearchBox placeholder="Search name, code, phone…" onChange={debouncedSetSearch} initialValue={search} />
            <select className="input" style={{ width: 150 }} value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
            <select className="input" style={{ width: 170 }} value={branchFilter} onChange={(e) => { setPage(1); setBranchFilter(e.target.value); }}>
              <option value="">All branches</option>
              {lookups.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <span className="card-head-sub">{count} employee{count === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <Loading label="Loading employees…" />
        ) : rows.length === 0 ? (
          search || statusFilter || branchFilter ? (
            <NoResults query={search} />
          ) : (
            <EmptyState
              icon={Users}
              title="No employees yet"
              message="Add your first team member to start tracking attendance and location."
              action={
                <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> Add employee
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Branch</th>
                    <th>Designation</th>
                    <th>Shift</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="sidebar-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                            {initials(emp.user?.full_name)}
                          </span>
                          <div>
                            <div className="cell-primary">{emp.user?.full_name}</div>
                            <div className="cell-sub">{emp.user?.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{emp.employee_code}</td>
                      <td>{lookups.branches.find((b) => b.id === emp.branch)?.name || "—"}</td>
                      <td>{lookups.designations.find((d) => d.id === emp.designation)?.title || "—"}</td>
                      <td>{lookups.shifts.find((s) => s.id === emp.shift)?.name || "—"}</td>
                      <td>
                        <StatusBadge tone={emp.status === "ACTIVE" ? "green" : "slate"}>
                          {emp.status === "ACTIVE" ? "Active" : "Disabled"}
                        </StatusBadge>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-sm btn-icon" title="Transfer to another location" onClick={() => setTransferring(emp)}>
                            <ArrowLeftRight size={14} />
                          </button>
                          <button className="btn btn-sm btn-icon" title="Request outdoor duty" onClick={() => setOutdoorDuty(emp)}>
                            <PlaneTakeoff size={14} />
                          </button>
                          <button className="btn btn-sm btn-icon" title="Edit" onClick={() => setEditing(emp)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-sm btn-icon"
                            title={emp.status === "ACTIVE" ? "Disable" : "Enable"}
                            onClick={() => setStatusTarget(emp)}
                          >
                            {emp.status === "ACTIVE" ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
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

      {createOpen && (
        <EmployeeCreateModal
          lookups={lookups}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
            refreshLookupEmployees();
          }}
        />
      )}

      {editing && (
        <EmployeeEditModal
          employee={editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === "ACTIVE" ? "Disable employee" : "Enable employee"}
          message={
            statusTarget.status === "ACTIVE"
              ? `${statusTarget.user?.full_name} will lose portal/app access, but their attendance history stays intact.`
              : `${statusTarget.user?.full_name} will regain access to check in and out.`
          }
          confirmLabel={statusTarget.status === "ACTIVE" ? "Disable" : "Enable"}
          danger={statusTarget.status === "ACTIVE"}
          onConfirm={handleStatusToggle}
          onClose={() => setStatusTarget(null)}
        />
      )}

      {transferring && (
        <TransferModal
          employee={transferring}
          lookups={lookups}
          onClose={() => setTransferring(null)}
          onSent={() => setTransferring(null)}
        />
      )}

      {outdoorDuty && (
        <OutdoorDutyModal
          employee={outdoorDuty}
          lookups={lookups}
          onClose={() => setOutdoorDuty(null)}
          onSent={() => setOutdoorDuty(null)}
        />
      )}
    </div>
  );
}

function LookupSelect({ label, value, onChange, options, labelKey = "name", allowEmpty = "None" }) {
  return (
    <Field label={label}>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{allowEmpty}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o[labelKey] || o.title || o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function EmployeeCreateModal({ lookups, onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    employee_code: "",
    branch: "",
    department: "",
    designation: "",
    shift: "",
    manager: "",
    date_of_joining: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form };
      ["branch", "department", "designation", "shift", "manager"].forEach((k) => {
        if (!payload[k]) delete payload[k];
      });
      if (!payload.email) delete payload.email;
      if (!payload.date_of_joining) delete payload.date_of_joining;
      await api.post("/employees/", payload);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create this employee. Check the fields and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add employee" subtitle="Creates a login and an HR profile together." onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="First name">
            <input className="input" required value={form.first_name} onChange={set("first_name")} />
          </Field>
          <Field label="Last name">
            <input className="input" value={form.last_name} onChange={set("last_name")} />
          </Field>
          <Field label="Phone number" hint="Used to sign in, e.g. +919876543210">
            <input className="input" required value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email (optional)">
            <input className="input" type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Temporary password">
            <input className="input" type="password" required value={form.password} onChange={set("password")} />
          </Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={set("role")}>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
            </select>
          </Field>
          <Field label="Employee code">
            <input className="input" required value={form.employee_code} onChange={set("employee_code")} />
          </Field>
          <Field label="Date of joining">
            <input className="input" type="date" value={form.date_of_joining} onChange={set("date_of_joining")} />
          </Field>

          <LookupSelect label="Branch" value={form.branch} onChange={(v) => setForm((f) => ({ ...f, branch: v }))} options={lookups.branches} />
          <LookupSelect label="Department" value={form.department} onChange={(v) => setForm((f) => ({ ...f, department: v }))} options={lookups.departments} />
          <LookupSelect label="Designation" value={form.designation} onChange={(v) => setForm((f) => ({ ...f, designation: v }))} options={lookups.designations} labelKey="title" />
          <LookupSelect label="Shift" value={form.shift} onChange={(v) => setForm((f) => ({ ...f, shift: v }))} options={lookups.shifts} />
          <LookupSelect label="Reports to" value={form.manager} onChange={(v) => setForm((f) => ({ ...f, manager: v }))} options={lookups.employees.map((e) => ({ id: e.id, name: e.user?.full_name }))} allowEmpty="No manager" />
        </div>

        <hr className="divider-dash" />
        <div className="form-grid">
          <Field label="Emergency contact name">
            <input className="input" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency contact phone">
            <input className="input" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
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
            {submitting ? "Creating…" : "Create employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmployeeEditModal({ employee, lookups, onClose, onSaved }) {
  const [form, setForm] = useState({
    branch: employee.branch || "",
    department: employee.department || "",
    designation: employee.designation || "",
    shift: employee.shift || "",
    manager: employee.manager || "",
    date_of_joining: employee.date_of_joining || "",
    date_of_exit: employee.date_of_exit || "",
    address: employee.address || "",
    emergency_contact_name: employee.emergency_contact_name || "",
    emergency_contact_phone: employee.emergency_contact_phone || "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form };
      ["branch", "department", "designation", "shift", "manager"].forEach((k) => {
        if (!payload[k]) payload[k] = null;
      });
      if (!payload.date_of_joining) payload.date_of_joining = null;
      if (!payload.date_of_exit) payload.date_of_exit = null;
      await api.patch(`/employees/${employee.id}/`, payload);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save these changes."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={employee.user?.full_name} subtitle={`Employee code ${employee.employee_code} · joined ${formatDate(employee.date_of_joining)}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <LookupSelect label="Branch" value={form.branch} onChange={(v) => setForm((f) => ({ ...f, branch: v }))} options={lookups.branches} />
          <LookupSelect label="Department" value={form.department} onChange={(v) => setForm((f) => ({ ...f, department: v }))} options={lookups.departments} />
          <LookupSelect label="Designation" value={form.designation} onChange={(v) => setForm((f) => ({ ...f, designation: v }))} options={lookups.designations} labelKey="title" />
          <LookupSelect label="Shift" value={form.shift} onChange={(v) => setForm((f) => ({ ...f, shift: v }))} options={lookups.shifts} />
          <LookupSelect
            label="Reports to"
            value={form.manager}
            onChange={(v) => setForm((f) => ({ ...f, manager: v }))}
            options={lookups.employees.filter((e) => e.id !== employee.id).map((e) => ({ id: e.id, name: e.user?.full_name }))}
            allowEmpty="No manager"
          />
          <Field label="Date of joining">
            <input className="input" type="date" value={form.date_of_joining || ""} onChange={set("date_of_joining")} />
          </Field>
          <Field label="Date of exit">
            <input className="input" type="date" value={form.date_of_exit || ""} onChange={set("date_of_exit")} />
          </Field>
          <Field label="Emergency contact name">
            <input className="input" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency contact phone">
            <input className="input" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
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
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ employee, lookups, onClose, onSent }) {
  const otherBranches = lookups.branches.filter((b) => b.id !== employee.branch);
  const [toBranch, setToBranch] = useState(otherBranches[0]?.id || "");
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentBranchName = lookups.branches.find((b) => b.id === employee.branch)?.name || "No location set";
  const managerName = lookups.employees.find((e) => e.id === employee.manager)?.user?.full_name;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!toBranch) {
      setError("Pick a location to transfer to.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/employees/${employee.id}/transfer/`, {
        to_branch: toBranch,
        reason,
        ...(effectiveDate ? { effective_date: effectiveDate } : {}),
      });
      onSent();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't submit the transfer request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Transfer ${employee.user?.full_name}`}
      subtitle={
        managerName
          ? `${managerName} will need to approve this before it takes effect.`
          : "A company admin will need to approve this before it takes effect."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid cols-1">
          <Field label="Current location">
            <input className="input" value={currentBranchName} disabled />
          </Field>
          <Field label="New location">
            <select className="input" value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
              {otherBranches.length === 0 && <option value="">No other active locations</option>}
              {otherBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Effective date (optional)">
            <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
          <Field label="Reason (optional)">
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Relocating closer to the new site" />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting || otherBranches.length === 0}>
            {submitting ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OutdoorDutyModal({ employee, lookups, onClose, onSent }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const managerName = lookups.employees.find((e) => e.id === employee.manager)?.user?.full_name;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError("Pick a start and end date.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/attendance/outdoor-duty/", {
        employee: employee.id,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      onSent();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't submit the outdoor duty request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Outdoor duty: ${employee.user?.full_name}`}
      subtitle={
        managerName
          ? `${managerName} will need to approve this before it takes effect.`
          : "A company admin will need to approve this before it takes effect."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid cols-2">
          <Field label="Start date">
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client site visit" />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </form>
    </Modal>
  );
}