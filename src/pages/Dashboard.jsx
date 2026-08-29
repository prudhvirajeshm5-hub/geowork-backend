import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GoogleMap, Marker, Polygon, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock3,
  Activity,
  MapPinOff,
  SatelliteDish,
  Briefcase,
  RefreshCw,
  X,
} from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import StatCard from "../components/StatCard";
import { Alert, Loading, StatusBadge } from "../components/ui";
import { timeAgo, todayISO, initials } from "../lib/format";

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 }; // Pune

/** Derive an "inside / near boundary / outside / offline" read from what the live-status API actually reports. */
function markerState(row) {
  if (row.connectivity_status === "OFFLINE") return { tone: "offline", color: "#7c8b88", label: "Offline" };
  if (row.connectivity_status === "GPS_DISABLED" || row.connectivity_status === "INTERNET_DISCONNECTED") {
    return { tone: "warning", color: "#B1690F", label: "Connectivity issue" };
  }
  if (row.current_work_area_name) return { tone: "inside", color: "#0F6E5C", label: "Inside workplace" };
  return { tone: "outside", color: "#A8342B", label: "Outside workplace" };
}

function pinIcon(color) {
  return {
    path: "M 0,0 C -6,-10 -10,-15 -10,-20 A 10,10 0 1 1 10,-20 C 10,-15 6,-10 0,0 Z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: 0.9,
    anchor: typeof window !== "undefined" && window.google ? new window.google.maps.Point(0, 0) : undefined,
  };
}

export default function Dashboard() {
  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: "geowork-google-maps",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("");
  const [date, setDate] = useState(todayISO());
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState([]);
  const [workAreas, setWorkAreas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/company/branches/", { params: { is_active: true, page_size: 100 } })
      .then(({ data }) => setBranches(data.results || data))
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { date };
      if (branch) params.branch = branch;
      const liveParams = { page_size: 100, ...(branch ? { branch } : {}) };
      const workAreaParams = { page_size: 200, is_active: true, ...(branch ? { branch } : {}) };
      const [summaryRes, liveRes, workAreaRes] = await Promise.all([
        api.get("/dashboard/summary/", { params }),
        api.get("/tracking/live/", { params: liveParams }),
        api.get("/geofence/work-areas/", { params: workAreaParams }),
      ]);
      setSummary(summaryRes.data);
      setLive(liveRes.data.results || liveRes.data);
      setWorkAreas(workAreaRes.data.results || workAreaRes.data);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load the dashboard right now."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, date]);

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const located = useMemo(() => live.filter((r) => r.last_latitude != null && r.last_longitude != null), [live]);
  const mapCenter = useMemo(() => {
    if (located[0]) return { lat: located[0].last_latitude, lng: located[0].last_longitude };
    const firstArea = workAreas.find((w) => w.boundary_points?.length);
    if (firstArea) return { lat: firstArea.boundary_points[0].latitude, lng: firstArea.boundary_points[0].longitude };
    return DEFAULT_CENTER;
  }, [located, workAreas]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Today's field ops</div>
          <h1>
            Good {greeting}, {user?.first_name || "Admin"}
          </h1>
          <p className="page-sub">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
          <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)} style={{ width: 180 }}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button className="btn btn-icon" onClick={load} title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      {!isManager && (
        <Alert tone="info">You're signed in as an employee. Dashboard figures reflect what admins and managers can see.</Alert>
      )}

      {loading && !summary ? (
        <Loading label="Pulling today's numbers…" />
      ) : (
        summary && (
          <div className="stat-grid">
            <StatCard icon={Users} label="Total employees" value={summary.total_employees} tone="slate" />
            <StatCard icon={CheckCircle2} label="Present" value={summary.present} tone="green" />
            <StatCard icon={XCircle} label="Absent" value={summary.absent} tone="red" />
            <StatCard icon={Clock3} label="Late arrivals" value={summary.late} tone="amber" />
            <StatCard icon={Activity} label="Currently working" value={summary.working} tone="blue" />
            <StatCard icon={Clock3} label="Half day" value={summary.half_day} tone="amber" />
            <StatCard icon={MapPinOff} label="Outside work area" value={summary.outside_work_area} tone="red" />
            <StatCard icon={SatelliteDish} label="GPS disabled" value={summary.gps_disabled} tone="red" />
          </div>
        )
      )}

      <div className="dash-layout">
        <div className="dash-map-card">
          {mapsLoadError ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Map could not be loaded.
            </div>
          ) : !mapsLoaded ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Loading map…
            </div>
          ) : (
            <GoogleMap
              center={mapCenter}
              zoom={13}
              mapContainerStyle={{ height: "100%", width: "100%" }}
              mapContainerClassName="map-shell"
              options={{ streetViewControl: false, fullscreenControl: true }}
            >
              {workAreas.map((wa) => {
                const positions = (wa.boundary_points || []).map((p) => ({ lat: p.latitude, lng: p.longitude }));
                if (positions.length < 3) return null;
                return (
                  <Polygon
                    key={wa.id}
                    paths={positions}
                    options={{
                      strokeColor: wa.color || "#0F6E5C",
                      strokeWeight: 1.5,
                      fillColor: wa.color || "#0F6E5C",
                      fillOpacity: 0.1,
                    }}
                  />
                );
              })}
              {located.map((r) => {
                const state = markerState(r);
                return (
                  <Marker
                    key={r.employee}
                    position={{ lat: r.last_latitude, lng: r.last_longitude }}
                    icon={pinIcon(state.color)}
                    onClick={() => setSelected(r)}
                  />
                );
              })}
              {selected && (
                <InfoWindow
                  position={{ lat: selected.last_latitude, lng: selected.last_longitude }}
                  onCloseClick={() => setSelected(null)}
                >
                  <strong>{selected.employee_name}</strong>
                </InfoWindow>
              )}
            </GoogleMap>
          )}

          <div className="map-legend">
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--ink-faint)",
                marginBottom: 2,
              }}
            >
              LIVE WORKFORCE
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#0F6E5C" }} /> Inside
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#B1690F" }} /> Near boundary / GPS issue
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#A8342B" }} /> Outside
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#7c8b88" }} /> Offline
            </div>
          </div>

          {selected && (
            <div className="dash-employee-panel">
              <div className="dash-employee-panel-head">
                <div>
                  <div className="cell-primary">{selected.employee_name}</div>
                  <div className="cell-sub mono">{selected.employee_code}</div>
                </div>
                <button className="dash-employee-panel-close" onClick={() => setSelected(null)} aria-label="Close">
                  <X size={14} />
                </button>
              </div>
              <div className="dash-employee-row">
                <span>Status</span>
                <StatusBadge
                  tone={
                    markerState(selected).tone === "inside"
                      ? "green"
                      : markerState(selected).tone === "outside"
                      ? "red"
                      : markerState(selected).tone === "warning"
                      ? "amber"
                      : "slate"
                  }
                >
                  {markerState(selected).label}
                </StatusBadge>
              </div>
              <div className="dash-employee-row">
                <span>Workplace</span>
                <span>{selected.current_work_area_name || "—"}</span>
              </div>
              <div className="dash-employee-row">
                <span>Shift</span>
                <span>{(selected.shift_status || "").replace(/_/g, " ") || "—"}</span>
              </div>
              <div className="dash-employee-row">
                <span>Last location</span>
                <span>{timeAgo(selected.last_ping_at)}</span>
              </div>
              {selected.last_accuracy_meters != null && (
                <div className="dash-employee-row">
                  <span>GPS accuracy</span>
                  <span>{Math.round(selected.last_accuracy_meters)}m</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="card-head">
            <div>
              <h3>Live roster</h3>
              <div className="card-head-sub">{located.length} reporting a location</div>
            </div>
            <Link to="/tracking" className="btn btn-sm">
              Full map
            </Link>
          </div>
          <div style={{ overflowY: "auto", flex: 1, maxHeight: 400 }}>
            {live.length === 0 ? (
              <div className="card-pad" style={{ color: "var(--ink-faint)", fontSize: 13 }}>
                No location pings reported yet today.
              </div>
            ) : (
              live.slice(0, 20).map((row) => {
                const state = markerState(row);
                return (
                  <div
                    key={row.employee}
                    onClick={() => row.last_latitude != null && setSelected(row)}
                    style={{
                      padding: "10px 18px",
                      borderBottom: "1px solid var(--line)",
                      cursor: row.last_latitude != null ? "pointer" : "default",
                      background: selected?.employee === row.employee ? "var(--panel-sunken)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="sidebar-avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>
                      {initials(row.employee_name)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="cell-primary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.employee_name}
                      </div>
                      <div className="cell-sub">{row.current_work_area_name || "No active work area"}</div>
                    </div>
                    <StatusBadge
                      tone={state.tone === "inside" ? "green" : state.tone === "outside" ? "red" : state.tone === "warning" ? "amber" : "slate"}
                    >
                      {state.label}
                    </StatusBadge>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Job management</h3>
            <div className="card-head-sub">Part of Phase 2 (V2.0)</div>
          </div>
          <Briefcase size={18} color="var(--ink-faint)" />
        </div>
        <div className="card-pad" style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
          {summary?.jobs_module_available ? (
            <span>
              {summary.jobs_completed} completed · {summary.pending_jobs} pending
            </span>
          ) : (
            "Job & customer-visit tracking rolls out with V2.0 Workforce Management. Nothing to report yet."
          )}
        </div>
      </div>
    </div>
  );
}