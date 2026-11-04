
import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, HelpCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./policies.css";

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All Policies" },
  { key: "holidays", label: "Holiday Calendar" },
  { key: "faq", label: "FAQ" },
];
const EMPTY_POLICY = { title: "", subtitle: "", body: "", published: false };
const EMPTY_HOLIDAY = { date: "", name: "" };
const EMPTY_FAQ = { question: "", answer: "", published: true };

function Stat({ label, value, sub, tone, Icon }) {
  return (
    <div className="po-stat">
      <span className={`po-stat-icon po-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="po-stat-label">{label}</div>
        <div className="po-stat-value">{value}</div>
        <div className="po-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function Policies() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [policies, setPolicies] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(EMPTY_POLICY);
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [holidayForm, setHolidayForm] = useState(EMPTY_HOLIDAY);
  const [faq, setFaq] = useState([]);
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ);
  const [editingFaq, setEditingFaq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPolicies = () =>
    api
      .get("/policies/manage/")
      .then(({ data }) => setPolicies(data.results || data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load policies.")))
      .finally(() => setLoading(false));

  const loadHolidays = () =>
    api
      .get("/policies/holidays/manage/", { params: { year } })
      .then(({ data }) => setHolidays(data.results || data))
      .catch(() => setHolidays([]));

  const loadFaq = () =>
    api
      .get("/policies/faq/manage/")
      .then(({ data }) => setFaq(data.results || data))
      .catch(() => setFaq([]));

  useEffect(() => {
    loadPolicies();
    loadFaq();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return policies.filter((p) => !q || [p.title, p.subtitle].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [policies, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const selected = policies.find((p) => p.slug === chosen) || filtered[0] || null;

  const publishedCount = policies.filter((p) => p.published).length;
  const draftCount = policies.length - publishedCount;

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  };

  const openAdd = () => {
    setError("");
    setForm(EMPTY_POLICY);
    setMode("add");
  };

  const openEdit = (p) => {
    setError("");
    setForm({ title: p.title, subtitle: p.subtitle || "", body: p.body || "", published: !!p.published });
    setMode("edit");
  };

  const savePolicy = async () => {
    if (!form.title.trim()) {
      setError("Enter a title for the policy.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "add") {
        const { data } = await api.post("/policies/manage/", form);
        setChosen(data.slug);
        flash("Policy added.");
      } else {
        await api.patch(`/policies/manage/${selected.slug}/`, form);
        setChosen(selected.slug);
        flash("Policy saved.");
      }
      setMode("view");
      await loadPolicies();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the policy."));
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (p) => {
    setError("");
    try {
      await api.patch(`/policies/manage/${p.slug}/`, { published: !p.published });
      await loadPolicies();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change the status."));
    }
  };

  const addHoliday = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/policies/holidays/manage/", holidayForm);
      setHolidayForm(EMPTY_HOLIDAY);
      await loadHolidays();
      flash("Holiday added.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't add the holiday."));
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (h) => {
    setError("");
    try {
      await api.delete(`/policies/holidays/manage/${h.id}/`);
      await loadHolidays();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't remove the holiday."));
    }
  };

  const saveFaq = async () => {
    setSaving(true);
    setError("");
    try {
      if (editingFaq) {
        await api.patch(`/policies/faq/manage/${editingFaq.id}/`, faqForm);
        flash("FAQ item saved.");
      } else {
        await api.post("/policies/faq/manage/", faqForm);
        flash("FAQ item added.");
      }
      setFaqForm(EMPTY_FAQ);
      setEditingFaq(null);
      await loadFaq();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the FAQ item."));
    } finally {
      setSaving(false);
    }
  };

  const editFaq = (f) => {
    setEditingFaq(f);
    setFaqForm({ question: f.question, answer: f.answer, published: !!f.published });
  };

  const removeFaq = async (f) => {
    setError("");
    try {
      await api.delete(`/policies/faq/manage/${f.id}/`);
      if (editingFaq && editingFaq.id === f.id) {
        setEditingFaq(null);
        setFaqForm(EMPTY_FAQ);
      }
      await loadFaq();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't remove the FAQ item."));
    }
  };

  const formPanel = (isEdit) => (
    <>
      <div className="po-form-title">{isEdit ? "Edit policy" : "Add policy"}</div>
      <label className="po-label">Title *</label>
      <input className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Working Hours" />
      <label className="po-label">Subtitle</label>
      <input className="input" maxLength={160} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="A short summary" />
      <label className="po-label">Policy text</label>
      <textarea className="input po-textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the policy here…" />
      <label className="po-check">
        <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
        Publish to employees
      </label>
      <div className="po-form-actions">
        <button type="button" className="btn" onClick={() => setMode("view")}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={savePolicy} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="po-head">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>Module 11</div>
          <h1 style={{ margin: 0 }}>Policies</h1>
          <p className="page-sub">Company policies, holiday calendar and frequently asked questions.</p>
        </div>
        <div className="po-controls">
          <div className="po-search">
            <input placeholder="Search policies…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Policy
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>
      {notice && <div className="po-notice">{notice}</div>}

      <div className="po-stats">
        <Stat label="All Policies" value={policies.length} sub="company policies" tone="blue" Icon={FileText} />
        <Stat label="Published" value={publishedCount} sub="visible to employees" tone="green" Icon={CheckCircle2} />
        <Stat label="Draft" value={draftCount} sub="not yet published" tone="amber" Icon={Clock} />
        <Stat label="Holidays" value={holidays.length} sub={`in ${year}`} tone="purple" Icon={Calendar} />
        <Stat label="FAQ Items" value={faq.filter((f) => f.published).length} sub="published questions" tone="red" Icon={HelpCircle} />
      </div>

      <div className="po-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`po-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <div className="po-main">
          <section className="po-card">
            {loading ? (
              <Loading />
            ) : filtered.length === 0 ? (
              <div className="po-note">No policies yet. Use Add Policy to create the first one.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data po-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Policy Title</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((p, i) => (
                        <tr key={p.slug} className={`po-row${selected && selected.slug === p.slug ? " on" : ""}`} onClick={() => { setChosen(p.slug); setMode("view"); }}>
                          <td>{(curPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td>
                            <div className="po-title">{p.title}</div>
                            {p.subtitle && <div className="po-sub">{p.subtitle}</div>}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`po-pill ${p.published ? "on" : "off"}`}
                              onClick={(e) => { e.stopPropagation(); togglePublished(p); }}
                              title="Click to change"
                            >
                              {p.published ? "Published" : "Draft"}
                            </button>
                          </td>
                          <td>
                            <button type="button" className="po-icon" title="Edit" onClick={(e) => { e.stopPropagation(); setChosen(p.slug); openEdit(p); }}>
                              <Pencil size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="po-footer">
                  <span className="po-sub">
                    Showing {(curPage - 1) * PAGE_SIZE + 1}-{Math.min(curPage * PAGE_SIZE, filtered.length)} of {filtered.length} policies
                  </span>
                  <div className="po-pager">
                    <button type="button" className="po-pg" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: pages }, (_, n) => n + 1).slice(0, 6).map((n) => (
                      <button key={n} type="button" className={`po-pg${n === curPage ? " on" : ""}`} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" className="po-pg" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="po-card">
            {mode === "add" && formPanel(false)}
            {mode === "edit" && selected && formPanel(true)}
            {mode === "view" && (!selected ? (
              <div className="po-note">Select a policy to read it, or add a new one.</div>
            ) : (
              <>
                <h3 className="po-panel-title">{selected.title}</h3>
                {selected.subtitle && <div className="po-sub" style={{ marginTop: 4 }}>{selected.subtitle}</div>}
                <div style={{ marginTop: 10 }}>
                  <span className={`po-pill ${selected.published ? "on" : "off"}`}>{selected.published ? "Published" : "Draft"}</span>
                </div>
                <div className="po-panel-body">{selected.body || "No text has been added to this policy yet."}</div>
                <div className="po-panel-actions">
                  <button type="button" onClick={() => openEdit(selected)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button type="button" onClick={() => togglePublished(selected)}>
                    {selected.published ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </>
            ))}
          </aside>
        </div>
      )}

      {tab === "holidays" && (
        <div className="po-main">
          <section className="po-card">
            <div className="po-row-between">
              <span className="po-title">Holidays {year}</span>
              <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} style={{ width: 110, height: 40 }} />
            </div>
            {holidays.length === 0 ? (
              <div className="po-note">No holidays set for {year} yet.</div>
            ) : (
              holidays.map((h) => (
                <div key={h.id} className="po-holiday">
                  <span className="po-date">{formatDate(h.date)}</span>
                  <span className="po-name">{h.name}</span>
                  <button type="button" className="po-icon danger" title="Remove" onClick={() => removeHoliday(h)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </section>
          <aside className="po-card">
            <div className="po-form-title">Add holiday</div>
            <label className="po-label">Date *</label>
            <input type="date" className="input" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
            <label className="po-label">Name *</label>
            <input className="input" maxLength={120} value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Diwali" />
            <div className="po-form-actions">
              <button type="button" className="btn btn-primary" onClick={addHoliday} disabled={saving || !holidayForm.date || !holidayForm.name.trim()}>
                {saving ? "Adding…" : "Add holiday"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {tab === "faq" && (
        <div className="po-main">
          <section className="po-card">
            {faq.length === 0 ? (
              <div className="po-note">No FAQ items yet. Add one on the right.</div>
            ) : (
              faq.map((f) => (
                <div key={f.id} className="po-faq">
                  <div className="po-row-between">
                    <span className="po-q">{f.question}</span>
                    <span className="po-faq-actions">
                      <span className={`po-pill ${f.published ? "on" : "off"}`}>{f.published ? "Published" : "Hidden"}</span>
                      <button type="button" className="po-icon" title="Edit" onClick={() => editFaq(f)}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="po-icon danger" title="Remove" onClick={() => removeFaq(f)}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  <div className="po-a">{f.answer}</div>
                </div>
              ))
            )}
          </section>
          <aside className="po-card">
            <div className="po-row-between">
              <span className="po-form-title" style={{ margin: 0 }}>{editingFaq ? "Edit FAQ item" : "Add FAQ item"}</span>
              {editingFaq && (
                <button type="button" className="po-icon" title="Cancel edit" onClick={() => { setEditingFaq(null); setFaqForm(EMPTY_FAQ); }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <label className="po-label">Question *</label>
            <input className="input" maxLength={200} value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} />
            <label className="po-label">Answer *</label>
            <textarea className="input po-textarea" value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} />
            <label className="po-check">
              <input type="checkbox" checked={faqForm.published} onChange={(e) => setFaqForm({ ...faqForm, published: e.target.checked })} />
              Show to employees
            </label>
            <div className="po-form-actions">
              <button type="button" className="btn btn-primary" onClick={saveFaq} disabled={saving || !faqForm.question.trim() || !faqForm.answer.trim()}>
                {saving ? "Saving…" : editingFaq ? "Save changes" : "Add FAQ item"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
