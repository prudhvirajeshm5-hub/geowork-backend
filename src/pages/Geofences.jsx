import { useEffect, useState } from "react";
import { Hexagon, Circle as CircleIcon, Square, Trash2, Pencil, RotateCcw, X } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import GeofenceMap from "../components/GeofenceMap";
import { Alert, ConfirmDialog, EmptyState, Field, Loading, Modal, StatusBadge } from "../components/ui";
import { titleCase } from "../lib/format";

const CATEGORIES = ["FACTORY", "WAREHOUSE", "OFFICE", "PARKING", "ASSEMBLY_LINE", "BATTERY_ROOM", "DISPATCH_AREA", "CUSTOMER_SITE", "OTHER"];
const COLORS = ["#4A90E2", "#B1690F", "#A8342B", "#29577E", "#7A4FB5", "#12181A"];

export default function Geofences() {
  const [workAreas, setWorkAreas] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [branchFilter, setBranchFilter] = useState("");

  const [drawMode, setDrawMode] = useState(null); // 'POLYGON' | 'RECTANGLE' | 'CIRCLE' | null
  const [resetSignal, setResetSignal] = useState(0);
  const [pendingShape, setPendingShape] = useState(null); // geometry captured, awaiting metadata
  const [redrawTarget, setRedrawTarget] = useState(null); // existing WorkArea being re-boundaried
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page_size: 200 };
      if (branchFilter) params.branch = branchFilter;
      const [waRes, bRes] = await Promise.all([
        api.get("/geofence/work-areas/", { params }),
        api.get("/company/branches/", { params: { page_size: 200 } }),
      ]);
      setWorkAreas(waRes.data.results || waRes.data);
      setBranches(bRes.data.results || bRes.data);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load geofences."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const startDraw = (mode) => {
    setSelected(null);
    setRedrawTarget(null);
    setDrawMode(mode);
    setResetSignal((s) => s + 1);
  };

  const startRedraw = (workArea, mode) => {
    setRedrawTarget(workArea);
    setDrawMode(mode);
    setResetSignal((s) => s + 1);
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setRedrawTarget(null);
    setResetSignal((s) => s + 1);
  };

  const handleDrawFinalize = (shapeData) => {
    if (redrawTarget) {
      setPendingShape({ ...shapeData, _redrawOf: redrawTarget });
    } else {
      setPendingShape(shapeData);
    }
    setDrawMode(null);
  };

  const handleSaved = () => {
    setPendingShape(null);
    setEditing(null);
    setRedrawTarget(null);
    load();
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/geofence/work-areas/${deleteTarget.id}/`);
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setSelected(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't delete this geofence."));
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 4</div>
          <h1>Geofence builder</h1>
          <p className="page-sub">Draw the boundaries that drive automatic check-in and check-out.</p>
        </div>
        <div className="draw-toolbar">
          {!drawMode ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => startDraw("POLYGON")}>
                <Hexagon size={14} /> Polygon
              </button>
              <button className="btn btn-sm" onClick={() => startDraw("RECTANGLE")}>
                <Square size={14} /> Rectangle
              </button>
              <button className="btn btn-sm" onClick={() => startDraw("CIRCLE")}>
                <CircleIcon size={14} /> Circle
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={cancelDraw}>
              <X size={14} /> Cancel drawing
            </button>
          )}
        </div>
      </div>

      <Alert>{error}</Alert>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, height: 620 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="card-head">
            <h3>Work areas</h3>
            <select className="input" style={{ width: 130 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <Loading />
            ) : workAreas.length === 0 ? (
              <EmptyState icon={Hexagon} title="No geofences yet" message="Draw a polygon, rectangle or circle on the map to define a work area." />
            ) : (
              workAreas.map((wa) => (
                <div
                  key={wa.id}
                  onClick={() => setSelected(wa)}
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    background: selected?.id === wa.id ? "var(--panel-sunken)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: wa.color, flexShrink: 0 }} />
                      <span className="cell-primary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {wa.name}
                      </span>
                    </div>
                    {!wa.is_active && <StatusBadge tone="slate">Inactive</StatusBadge>}
                  </div>
                  <div className="cell-sub" style={{ marginTop: 3 }}>
                    {titleCase(wa.category)} · {wa.branch_name} · {titleCase(wa.shape_type)}
                  </div>
                  {selected?.id === wa.id && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditing(wa); }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); startRedraw(wa, "POLYGON"); }} title="Redraw as polygon">
                        <RotateCcw size={12} /> Redraw
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(wa); }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <GeofenceMap
          workAreas={workAreas}
          selectedId={selected?.id}
          onSelectArea={setSelected}
          drawMode={drawMode}
          onDrawFinalize={handleDrawFinalize}
          resetSignal={resetSignal}
        />
      </div>

      {pendingShape && (
        <ShapeMetadataModal
          shape={pendingShape}
          branches={branches}
          redrawTarget={pendingShape._redrawOf}
          onClose={() => {
            setPendingShape(null);
            setRedrawTarget(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {editing && (
        <WorkAreaEditModal
          workArea={editing}
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete geofence"
          message={`"${deleteTarget.name}" will stop driving auto check-in/out. Past attendance records that used it are kept.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ShapeMetadataModal({ shape, branches, redrawTarget, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: redrawTarget?.name || "",
    category: redrawTarget?.category || "OFFICE",
    color: redrawTarget?.color || COLORS[0],
    branch: redrawTarget?.branch || "",
    is_active: true,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.branch) {
      setError("Choose which branch this work area belongs to.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { _redrawOf, ...geometry } = shape;
      const payload = { ...geometry, name: form.name, category: form.category, color: form.color, branch: form.branch };
      if (redrawTarget) {
        await api.patch(`/geofence/work-areas/${redrawTarget.id}/`, payload);
      } else {
        await api.post("/geofence/work-areas/", { ...payload, is_active: form.is_active });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save this geofence. Check the shape and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={redrawTarget ? `Redraw "${redrawTarget.name}"` : "New geofence"} subtitle={`Shape: ${titleCase(shape.shape_type)}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Name">
            <input className="input" required value={form.name} onChange={set("name")} placeholder="e.g. Warehouse A Yard" />
          </Field>
          <Field label="Branch">
            <select className="input" required value={form.branch} onChange={set("branch")}>
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Color">
            <div style={{ display: "flex", gap: 6, alignItems: "center", height: 38 }}>
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: c,
                    border: form.color === c ? "2px solid var(--ink)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </Field>
        </div>
        {shape.shape_type === "CIRCLE" && (
          <p className="hint" style={{ marginTop: 10 }}>Radius: {shape.radius_meters}m</p>
        )}
        {shape.shape_type === "POLYGON" && (
          <p className="hint" style={{ marginTop: 10 }}>{shape.points.length} boundary points</p>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Discard shape
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save geofence"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkAreaEditModal({ workArea, branches, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: workArea.name,
    category: workArea.category,
    color: workArea.color,
    branch: workArea.branch,
    is_active: workArea.is_active,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.patch(`/geofence/work-areas/${workArea.id}/`, form);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Edit "${workArea.name}"`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <div className="form-grid">
          <Field label="Name">
            <input className="input" required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Branch">
            <select className="input" value={form.branch} onChange={set("branch")}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={form.is_active ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "1" }))}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
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
