import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
} from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, ConfirmDialog, EmptyState, Field, Loading, Modal, NoResults, Pager, SearchBox, StatusBadge } from "../components/ui";
import { debounce, formatDate, initials } from "../lib/format";
import "../employees.css";
import "../add-employee.css";
import {
  AttendanceHistoryModal,
  ChangeStatusModal,
  DisableEmployeeModal,
  ResetPasswordModal,
  ViewEmployeeModal,
  ViewLocationModal,
} from "./employee-actions";
import { useAuth } from "../lib/auth";

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
  const [viewing, setViewing] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [modal, setModal] = useState(null);

  const openFrom = (type, emp) => {
    setModal({ type, emp });
    setMenuFor(null);
  };
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState([]);
  const [liveRows, setLiveRows] = useState([]);
  const [onDutyIds, setOnDutyIds] = useState(() => new Set());

  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    Promise.all([
      api.get("/tracking/live/", { params: { page_size: 200 } }).catch(() => ({ data: [] })),
      api.get("/attendance/records/", { params: { date: today, page_size: 500 } }).catch(() => ({ data: [] })),
    ]).then(([l, a]) => {
      setLiveRows(l.data.results || l.data || []);
      const recs = a.data.results || a.data || [];
      setOnDutyIds(new Set(recs.filter((r) => r.check_in_time && !r.check_out_time).map((r) => r.employee)));
    });
  }, []);

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
      const params = { page, page_size: pageSize };
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
  }, [page, pageSize, search, statusFilter, branchFilter]);

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

  const totalCount = lookups.employees.length;
  const activeCount = lookups.employees.filter((e) => e.status === "ACTIVE").length;
  const inactiveCount = totalCount - activeCount;
  const onDutyCount = lookups.employees.filter((e) => e.status === "ACTIVE" && onDutyIds.has(e.id)).length;
  const filtersActive = Boolean(search || statusFilter || branchFilter);
  const liveById = useMemo(() => Object.fromEntries(liveRows.map((r) => [r.employee, r])), [liveRows]);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const fromRow = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, count);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const pageNumbers = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p <= 5 || p === totalPages) pageNumbers.push(p);
    else if (pageNumbers[pageNumbers.length - 1] !== "…") pageNumbers.push("…");
  }

  const lookupName = (list, id, key = "name") => list.find((x) => x.id === id)?.[key] || "—";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setBranchFilter("");
    setPage(1);
  };

  const toggleSelected = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAllOnPage = () =>
    setSelected(allOnPageSelected ? [] : rows.map((r) => r.id));

  const exportCsv = () => {
    const header = ["Name", "Code", "Phone", "Branch", "Department", "Designation", "Shift", "Status"];
    const lines = rows.map((e) =>
      [
        e.user?.full_name,
        e.employee_code,
        e.user?.phone,
        lookupName(lookups.branches, e.branch),
        lookupName(lookups.departments, e.department),
        lookupName(lookups.designations, e.designation, "title"),
        lookupName(lookups.shifts, e.shift),
        e.status,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCard = (label, value, tone, Icon, percent, barColor) => (
    <div className="emp-stat">
      <span className={`emp-stat-icon emp-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div className="emp-stat-body">
        <div className="emp-stat-label">{label}</div>
        <div className="emp-stat-value">{value}</div>
        {percent != null && <div className={`emp-stat-pct emp-text-${tone}`}>{percent}%</div>}
        {percent != null && (
          <div className="emp-bar">
            <span style={{ width: `${Math.min(100, percent)}%`, background: barColor }} />
          </div>
        )}
      </div>
    </div>
  );

  const pct = (n) => (totalCount ? Math.round((n / totalCount) * 100) : 0);

  return (
    <div className="page emp-page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <div className="emp-module">Module 3</div>
          <h1>Employees</h1>
          <p className="page-sub">Manage your field staff, track status, and keep organisation details up to date.</p>
        </div>
        <div className="emp-head-actions">
          <button className="btn btn-primary emp-add" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            Add Employee
            <span className="emp-add-caret">
              <ChevronDown size={15} />
            </span>
          </button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="emp-stats">
        {statCard("Total Employees", totalCount, "blue", Users, null, null)}
        {statCard("Active Employees", activeCount, "green", UserCheck, pct(activeCount), "#1e8e5a")}
        {statCard("On Duty (Now)", onDutyCount, "blue", MapPin, pct(onDutyCount), "#2f6fd0")}
        {statCard("On Leave", "—", "amber", CalendarDays, null, null)}
        {statCard("Inactive", inactiveCount, "red", UserX, pct(inactiveCount), "#d64541")}
      </div>

      <div className="card emp-card">
        <div className="emp-filters">
          <div className="emp-search">
            <Search size={15} />
            <input
              placeholder="Search name, code, phone…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input"
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Branches</option>
            {lookups.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button className="btn emp-clear" onClick={clearFilters} disabled={!filtersActive}>
            Clear
          </button>
          <button className="btn btn-primary emp-export" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={15} />
            Export
          </button>
        </div>

        {loading ? (
          <Loading label="Loading employees…" />
        ) : rows.length === 0 ? (
          filtersActive ? (
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
              <table className="data emp-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
                    </th>
                    <th style={{ width: 44 }}>#</th>
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Branch</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Shift</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((emp, i) => {
                    const live = liveById[emp.id];
                    const onDuty = emp.status === "ACTIVE" && onDutyIds.has(emp.id);
                    const statusTone = emp.status !== "ACTIVE" ? "slate" : onDuty ? "blue" : "green";
                    const statusLabel = emp.status !== "ACTIVE" ? "Inactive" : onDuty ? "On Duty" : "Active";
                    return (
                      <tr key={emp.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(emp.id)}
                            onChange={() => toggleSelected(emp.id)}
                          />
                        </td>
                        <td>{(page - 1) * pageSize + i + 1}</td>
                        <td>
                          <div className="emp-name">
                            <span className="emp-avatar">{initials(emp.user?.full_name)}</span>
                            <div>
                              <div className="cell-primary">{emp.user?.full_name}</div>
                              <div className="emp-sub">{emp.user?.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{emp.employee_code}</td>
                        <td>{lookupName(lookups.branches, emp.branch)}</td>
                        <td>{lookupName(lookups.departments, emp.department)}</td>
                        <td>{lookupName(lookups.designations, emp.designation, "title")}</td>
                        <td>{lookupName(lookups.shifts, emp.shift)}</td>
                        <td>
                          <span className={`emp-pill emp-pill-${statusTone}`}>{statusLabel}</span>
                        </td>
                        <td>
                          {live ? (
                            <div className="emp-last">
                              <span className={`emp-dot ${live.is_online ? "on" : "off"}`} />
                              <div>
                                <div>{live.is_online ? "Online" : "Offline"}</div>
                                <div className="emp-sub">
                                  {live.minutes_since_last_ping != null ? `${live.minutes_since_last_ping} mins ago` : ""}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="emp-sub">No signal</span>
                          )}
                        </td>
                        <td>
                          <div className="emp-actions emp-actions-rel">
                            <button className="emp-action" title="View" onClick={() => setViewing(emp)}>
                              <Eye size={15} />
                            </button>
                            <button className="emp-action" title="Edit" onClick={() => setEditing(emp)}>
                              <Pencil size={15} />
                            </button>
                            <button
                              className="emp-action"
                              title="More"
                              onClick={() => setMenuFor(menuFor === emp.id ? null : emp.id)}
                            >
                              <MoreHorizontal size={15} />
                            </button>
                            {menuFor === emp.id && (
                              <div className="emp-menu">
                                <button type="button" onClick={() => { setViewing(emp); setMenuFor(null); }}>View details</button>
                                <button type="button" onClick={() => { setEditing(emp); setMenuFor(null); }}>Edit employee</button>
                                <button type="button" onClick={() => openFrom("reset", emp)}>Reset password</button>
                                <button type="button" onClick={() => openFrom("status", emp)}>Change status</button>
                                <button type="button" onClick={() => openFrom("location", emp)}>View location</button>
                                <button type="button" onClick={() => openFrom("attendance", emp)}>Attendance history</button>
                                {emp.status === "ACTIVE" && (
                                  <button type="button" className="danger" onClick={() => openFrom("disable", emp)}>Disable employee</button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="emp-footer">
              <span className="emp-sub">
                Showing {fromRow}-{toRow} of {count} employees
              </span>
              <div className="emp-pager">
                <button className="emp-pg" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {pageNumbers.map((n, idx) =>
                  n === "…" ? (
                    <span key={`e${idx}`} className="emp-ellipsis">
                      …
                    </span>
                  ) : (
                    <button key={n} className={`emp-pg${n === page ? " on" : ""}`} onClick={() => setPage(n)}>
                      {n}
                    </button>
                  )
                )}
                <button className="emp-pg" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={16} />
                </button>
                <select
                  className="input emp-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
      {viewing && (
        <ViewEmployeeModal
          emp={viewing}
          lookups={lookups}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {modal?.type === "status" && (
        <ChangeStatusModal
          emp={modal.emp}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
            refreshLookupEmployees();
          }}
        />
      )}

      {modal?.type === "reset" && <ResetPasswordModal emp={modal.emp} onClose={() => setModal(null)} />}

      {modal?.type === "location" && (
        <ViewLocationModal emp={modal.emp} live={liveById[modal.emp.id]} onClose={() => setModal(null)} />
      )}

      {modal?.type === "attendance" && <AttendanceHistoryModal emp={modal.emp} onClose={() => setModal(null)} />}

      {modal?.type === "disable" && (
        <DisableEmployeeModal
          emp={modal.emp}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
            refreshLookupEmployees();
          }}
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

const DIAL_CODES = ["+91", "+1", "+44", "+971"];
const WIZARD_STEPS = ["Personal Information", "Organisation Details", "Work & Shift Details", "Account & Access"];

function EmployeeCreateModal({ lookups, onClose, onCreated }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    employee_code: "",
    phone_dial: "+91",
    phone: "",
    email: "",
    emergency_contact_name: "",
    emergency_dial: "+91",
    emergency_contact_phone: "",
    address: "",
    branch: "",
    department: "",
    designation: "",
    manager: "",
    date_of_joining: "",
    shift: "",
    monthly_salary: "",
    role: "EMPLOYEE",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nameOf = (list, id, key = "name") => list.find((x) => String(x.id) === String(id))?.[key] || "";

  const validate = (i) => {
    if (i === 0) {
      if (!form.first_name.trim()) return "Enter the first name.";
      if (!form.employee_code.trim()) return "Enter an employee code, or tap Auto.";
      if (!form.phone.trim()) return "Enter the phone number.";
    }
    if (i === 3 && form.password.length < 8) return "The temporary password needs at least 8 characters.";
    return "";
  };

  const goNext = () => {
    const msg = validate(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setStep(step + 1);
  };

  const goBack = () => {
    setError("");
    setStep(step - 1);
  };

  const autoCode = () => setVal("employee_code", `EMP${String(Date.now()).slice(-6)}`);

  const submit = async () => {
    const msg = validate(0) || validate(3);
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      employee_code: form.employee_code.trim(),
      phone: `${form.phone_dial}${form.phone.replace(/\s+/g, "")}`,
      password: form.password,
      role: form.role,
      email: form.email.trim(),
      branch: form.branch,
      department: form.department,
      designation: form.designation,
      shift: form.shift,
      manager: form.manager,
      date_of_joining: form.date_of_joining,
      address: form.address.trim(),
      emergency_contact_name: form.emergency_contact_name.trim(),
      emergency_contact_phone: form.emergency_contact_phone
        ? `${form.emergency_dial}${form.emergency_contact_phone.replace(/\s+/g, "")}`
        : "",
    };
    ["branch", "department", "designation", "shift", "manager"].forEach((k) => {
      if (!payload[k]) delete payload[k];
    });
    if (!payload.email) delete payload.email;
    if (!payload.date_of_joining) delete payload.date_of_joining;
    if (isAdmin && form.monthly_salary !== "") payload.monthly_salary = form.monthly_salary;
    try {
      await api.post("/employees/", payload);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create this employee. Check the fields and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const previewRows = [
    ["Employee Code", form.employee_code],
    ["Phone", form.phone ? `${form.phone_dial} ${form.phone}` : ""],
    ["Email", form.email],
    ["Department", nameOf(lookups.departments, form.department)],
    ["Designation", nameOf(lookups.designations, form.designation, "title")],
    ["Branch", nameOf(lookups.branches, form.branch)],
    ["Shift", nameOf(lookups.shifts, form.shift)],
    ["Date of Joining", form.date_of_joining],
  ];

  const field = (label, required, child, hint) => (
    <label className="aem-field">
      <span className="aem-label">
        {label}
        {required && <b className="aem-req"> *</b>}
      </span>
      {child}
      {hint && <span className="aem-hint">{hint}</span>}
    </label>
  );

  const personal = () => (
    <div className="aem-grid">
      <div className="aem-photo">
        <div className="aem-photo-box">
          <Camera size={20} />
          <span>Upload Photo</span>
          <small>Available after saving</small>
        </div>
      </div>
      <div className="aem-cols">
        {field("First Name", true, <input className="input" value={form.first_name} onChange={set("first_name")} placeholder="Enter first name" />)}
        {field("Last Name", false, <input className="input" value={form.last_name} onChange={set("last_name")} placeholder="Enter last name" />)}
        <div className="aem-field">
          <span className="aem-label">
            Employee Code<b className="aem-req"> *</b>
          </span>
          <div className="aem-group">
            <input className="input" value={form.employee_code} onChange={set("employee_code")} placeholder="Auto-generate or enter" />
            <button type="button" className="aem-auto" onClick={autoCode}>Auto</button>
          </div>
        </div>
        <div className="aem-field">
          <span className="aem-label">
            Phone Number<b className="aem-req"> *</b>
          </span>
          <div className="aem-group">
            <select className="input aem-dial" value={form.phone_dial} onChange={set("phone_dial")}>
              {DIAL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" value={form.phone} onChange={set("phone")} placeholder="Enter phone number" />
          </div>
        </div>
        {field("Email (Optional)", false, <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="Enter email address" />)}
        <div className="aem-field">
          <span className="aem-label">Emergency Contact Phone</span>
          <div className="aem-group">
            <select className="input aem-dial" value={form.emergency_dial} onChange={set("emergency_dial")}>
              {DIAL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} placeholder="Enter emergency number" />
          </div>
        </div>
        {field("Emergency Contact Name", false, <input className="input" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} placeholder="Enter emergency contact name" />)}
        <div className="aem-full">
          {field("Address", false,
            <textarea className="input" rows={3} maxLength={200} value={form.address} onChange={set("address")} placeholder="Enter full address" />,
            `${form.address.length}/200`)}
        </div>
      </div>
    </div>
  );

  const selectOf = (key, list, labelKey = "name") => (
    <select className="input" value={form[key]} onChange={set(key)}>
      <option value="">Select</option>
      {list.map((x) => <option key={x.id} value={x.id}>{x[labelKey]}</option>)}
    </select>
  );

  const organisation = () => (
    <div className="aem-cols">
      {field("Branch", false, selectOf("branch", lookups.branches))}
      {field("Department", false, selectOf("department", lookups.departments))}
      {field("Designation", false, selectOf("designation", lookups.designations, "title"))}
      {field("Reports To", false, (
        <select className="input" value={form.manager} onChange={set("manager")}>
          <option value="">No manager</option>
          {lookups.employees.map((e) => <option key={e.id} value={e.id}>{e.user?.full_name}</option>)}
        </select>
      ))}
      {field("Date of Joining", false, <input className="input" type="date" value={form.date_of_joining} onChange={set("date_of_joining")} />)}
    </div>
  );

  const work = () => (
    <div className="aem-cols">
      {field("Shift", false, selectOf("shift", lookups.shifts))}
      {isAdmin && field("Monthly Salary (₹)", false, <input className="input" type="number" min="0" step="0.01" value={form.monthly_salary} onChange={set("monthly_salary")} placeholder="Enter monthly salary" />)}
    </div>
  );

  const account = () => (
    <div className="aem-cols">
      {field("Login Phone", false, <input className="input" value={form.phone ? `${form.phone_dial}${form.phone}` : ""} readOnly placeholder="Set on the first step" />)}
      {field("Role", false, (
        <select className="input" value={form.role} onChange={set("role")}>
          <option value="EMPLOYEE">Employee</option>
          <option value="MANAGER">Manager</option>
        </select>
      ))}
      <div className="aem-full">
        {field("Temporary Password", true, <input className="input" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />,
          "The employee should change this after the first login.")}
      </div>
    </div>
  );

  const bodies = [personal, organisation, work, account];

  return (
    <Modal
      title="Add Employee"
      subtitle="Create a new employee and assign organisation details. Login credentials will be generated automatically."
      onClose={onClose}
      wide
    >
      <div className="aem-steps">
        {WIZARD_STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`aem-step${i === step ? " on" : ""}${i < step ? " done" : ""}`}
            onClick={() => (i < step ? setStep(i) : null)}
          >
            <span className="aem-num">{i < step ? <Check size={13} /> : i + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <Alert>{error}</Alert>

      <div className="aem-body">
        <div className="aem-main">
          <div className="aem-title">
            <span className="aem-title-icon">{step + 1}</span>
            <div>
              <div className="aem-title-text">{WIZARD_STEPS[step]}</div>
              <div className="aem-sub">Basic details about the employee.</div>
            </div>
          </div>
          {bodies[step]()}
        </div>

        <aside className="aem-preview">
          <div className="aem-preview-title">Employee Preview</div>
          <div className="aem-preview-id">
            <span className="aem-preview-avatar">
              <Users size={28} />
            </span>
            <div>
              <div className="aem-preview-name">{fullName || "New Employee"}</div>
              <div className="aem-sub">{form.employee_code || "-"}</div>
            </div>
          </div>
          <div className="aem-preview-rows">
            {previewRows.map(([label, value]) => (
              <div key={label} className="aem-preview-row">
                <span>{label}</span>
                <b>{value || "-"}</b>
              </div>
            ))}
          </div>
          <div className="aem-note">
            A login username and temporary password will be generated after saving the employee.
          </div>
        </aside>
      </div>

      <div className="aem-footer">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <div className="aem-footer-right">
          {step > 0 && (
            <button type="button" className="btn" onClick={goBack}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          {step < WIZARD_STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              Next <ArrowRight size={15} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create Employee"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EmployeeEditModal({ employee, lookups, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
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
    monthly_salary: employee.monthly_salary ?? "",
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
      if (payload.monthly_salary === "") payload.monthly_salary = null;
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
          {isAdmin && (
            <Field label="Monthly salary (₹)">
              <input className="input" type="number" min="0" step="0.01" value={form.monthly_salary} onChange={set("monthly_salary")} />
            </Field>
          )}
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
