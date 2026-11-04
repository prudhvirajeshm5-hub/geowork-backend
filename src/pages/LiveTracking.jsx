
import { useEffect, useMemo, useState } from "react";
import { Circle, GoogleMap, Marker, Polygon, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { Battery, Clock, MapPin, Pause, Play, RefreshCw, ShieldAlert, Users, WifiOff } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { initials } from "../lib/format";
import { Alert, Loading } from "../components/ui";
import "./live-tracking.css";

const MAPS_OPTIONS = { id: "geowork-maps", googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY };
const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 };
const COLORS = { on: "#1e8e5a", outside: "#d64541", offline: "#8a94a8" };
const STATUS_LABEL = { on: "On Duty", outside: "Outside Area", offline: "Offline" };
const REFRESH_MS = 30000;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusOf(r) {
  if (!r.is_online) return "offline";
  if (!r.current_work_area && !r.current_work_area_name) return "outside";
  return "on";
}

function minutesBetween(a, b) {
  return Math.max(0, (new Date(b) - new Date(a)) / 60000);
}

function fmtDuration(m) {
  return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--";
}

function metres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function StatCard({ label, value, sub, tone, Icon }) {
  return (
    <div className="lt-stat">
      <span className={`lt-stat-icon lt-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="lt-stat-label">{label}</div>
        <div className="lt-stat-value">{value}</div>
        <div className="lt-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function LiveTracking() {
  const { isLoaded, loadError } = useJsApiLoader(MAPS_OPTIONS);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [live, setLive] = useState([]);
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [mapType, setMapType] = useState("roadmap");
  const [showFence, setShowFence] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [movementDate, setMovementDate] = useState(todayIso());
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadLive = () =>
    api
      .get("/tracking/live/", { params: { page_size: 200 } })
      .then(({ data }) => {
        setLive(data.results || data);
        setError("");
      })
      .catch((err) => setError(apiErrorMessage(err, "Couldn't refresh live locations.")));

  useEffect(() => {
    api
      .get("/company/branches/", { params: { page_size: 200 } })
      .then(({ data }) => setBranches(data.results || data))
      .catch(() => {});
    api
      .get("/geofence/work-areas/", { params: { page_size: 200, is_active: true } })
      .then(({ data }) => setAreas(data.results || data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadLive();
    if (paused) return undefined;
    const timer = setInterval(loadLive, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  useEffect(() => {
    if (!selectedId) {
      setHistory(null);
      return;
    }
    setHistoryLoading(true);
    api
      .get("/tracking/history/", { params: { employee_id: selectedId, date: movementDate } })
      .then(({ data }) => setHistory(data))
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false));
  }, [selectedId, movementDate]);

  const visible = useMemo(
    () => live.filter((r) => !branchId || String(r.branch) === String(branchId)),
    [live, branchId]
  );

  const counts = useMemo(() => {
    const c = { total: visible.length, on: 0, outside: 0, offline: 0, online: 0 };
    visible.forEach((r) => {
      c[statusOf(r)] += 1;
      if (r.is_online) c.online += 1;
    });
    return c;
  }, [visible]);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((r) => {
      const tabOk = tab === "all" || (tab === "online" ? r.is_online : !r.is_online);
      const qOk = !q || [r.employee_name, r.employee_code].some((v) => String(v || "").toLowerCase().includes(q));
      return tabOk && qOk;
    });
  }, [visible, tab, query]);

  const selected = visible.find((r) => r.employee === selectedId) || null;
  const located = visible.filter((r) => r.last_latitude != null && r.last_longitude != null);
  const center = located[0] ? { lat: located[0].last_latitude, lng: located[0].last_longitude } : DEFAULT_CENTER;

  const segments = history?.segments || [];
  const routePath = segments.map((s) => ({ lat: s.lat, lng: s.lng }));
  const insideMin = segments.filter((s) => s.area_id).reduce((n, s) => n + minutesBetween(s.start, s.end), 0);
  const outsideMin = segments.filter((s) => !s.area_id).reduce((n, s) => n + minutesBetween(s.start, s.end), 0);
  const placesVisited = segments.filter((s) => s.area_id).length;
  const distanceKm = routePath.slice(1).reduce((km, p, i) => km + metres(routePath[i], p) / 1000, 0);

  const markerIcon = (status, isSelected) => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: isSelected ? 13 : 10,
    fillColor: COLORS[status],
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  });

  const renderAreas = () =>
    areas.map((a) => {
      const color = a.color || "#2E86DE";
      const options = { strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.12 };
      if (a.center_point?.coordinates && a.radius_meters) {
        const [lng, lat] = a.center_point.coordinates;
        return <Circle key={`area-${a.id}`} center={{ lat, lng }} radius={a.radius_meters} options={options} />;
      }
      const ring = a.boundary?.coordinates?.[0];
      if (ring?.length) {
        return <Polygon key={`area-${a.id}`} paths={ring.map(([lng, lat]) => ({ lat, lng }))} options={options} />;
      }
      return null;
    });

  const renderMap = () => {
    if (loadError) return <div className="lt-msg">Google Maps couldn't load. Check the Maps API key.</div>;
    if (!isLoaded) return <Loading />;
    return (
      <GoogleMap
        mapContainerStyle={{ height: "100%", width: "100%" }}
        center={center}
        zoom={12}
        mapTypeId={mapType}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      >
        {showFence && renderAreas()}
        {showRoute && routePath.length > 1 && (
          <Polyline path={routePath} options={{ strokeColor: "#2f6fd0", strokeWeight: 4 }} />
        )}
        {located.map((r) => {
          const st = statusOf(r);
          return (
            <Marker
              key={r.employee}
              position={{ lat: r.last_latitude, lng: r.last_longitude }}
              icon={markerIcon(st, r.employee === selectedId)}
              label={{ text: initials(r.employee_name), color: "#ffffff", fontSize: "10px", fontWeight: "700" }}
              title={`${r.employee_name} · ${STATUS_LABEL[st]}`}
              onClick={() => setSelectedId(r.employee)}
            />
          );
        })}
      </GoogleMap>
    );
  };

  const pillFor = (r) => {
    const st = statusOf(r);
    return <span className={`lt-pill ${st}`}>{STATUS_LABEL[st]}</span>;
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="lt-head">
        <div>
          <div className="emp-module" style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", marginBottom: 6 }}>
            Module 6
          </div>
          <h1 style={{ margin: 0 }}>Live Tracking</h1>
          <p className="page-sub">Track your field employees in real-time, view their live location, status and work area.</p>
        </div>
        <div className="lt-controls">
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className={`lt-live ${paused ? "paused" : "on"}`}>
            <i />
            {paused ? "Paused" : "Live"}
          </span>
          <button type="button" className="lt-btn-ghost" onClick={() => setPaused(!paused)}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? "Resume auto-refresh" : "Pause auto-refresh"}
          </button>
          <button type="button" className="lt-icon-btn" title="Refresh" onClick={loadLive}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="lt-stats">
        <StatCard label="Total Employees" value={counts.total} sub={`${counts.online} online · ${counts.offline} offline`} tone="blue" Icon={Users} />
        <StatCard label="On Duty (In Area)" value={counts.on} sub={`${pct(counts.on, counts.total)}% of total`} tone="green" Icon={MapPin} />
        <StatCard label="Outside Work Area" value={counts.outside} sub={`${pct(counts.outside, counts.total)}% of total`} tone="red" Icon={ShieldAlert} />
        <StatCard label="Idle / No Movement" value="—" sub="Not tracked yet" tone="amber" Icon={Clock} />
        <StatCard label="Offline" value={counts.offline} sub={`${pct(counts.offline, counts.total)}% of total`} tone="grey" Icon={WifiOff} />
      </div>

      <div className="lt-main">
        <div className="lt-left">
          <div className="lt-card" style={{ padding: 10 }}>
            <div className="lt-map-wrap">
              {renderMap()}
              <div className="lt-seg">
                <button type="button" className={mapType === "roadmap" ? "on" : ""} onClick={() => setMapType("roadmap")}>Map</button>
                <button type="button" className={mapType === "satellite" ? "on" : ""} onClick={() => setMapType("satellite")}>Satellite</button>
              </div>
              <div className="lt-legend">
                <span><i style={{ background: COLORS.on }} />On Duty (In Area)</span>
                <span><i style={{ background: COLORS.outside }} />Outside Work Area</span>
                <span><i style={{ background: COLORS.offline }} />Offline</span>
                <span><i style={{ background: "transparent", border: "2px dashed #1e8e5a" }} />Geofence Area</span>
              </div>
            </div>
          </div>

          <div className="lt-bottom">
            <section className="lt-card">
              <div className="lt-card-title">
                <span>Selected Employee</span>
                {selected && (
                  <button type="button" className="lt-icon-btn" style={{ width: 30, height: 30 }} onClick={() => setSelectedId(null)} title="Clear">×</button>
                )}
              </div>
              {!selected ? (
                <div className="lt-sub">Select an employee from the roster or the map.</div>
              ) : (
                <>
                  <div className="lt-person">
                    <span className="lt-avatar">{initials(selected.employee_name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lt-person-name">{selected.employee_name}</div>
                      <div className="lt-sub">{selected.employee_code} · {selected.branch_name || "—"}</div>
                    </div>
                    {pillFor(selected)}
                  </div>
                  <div className="lt-facts">
                    <div className="lt-fact">
                      Current Location
                      <b>{selected.current_work_area_name || "Outside work area"}</b>
                    </div>
                    <div className="lt-fact">
                      Battery
                      <b>{selected.last_battery_level != null ? `${selected.last_battery_level}%` : "—"}</b>
                    </div>
                    <div className="lt-fact">
                      Accuracy
                      <b>{selected.last_accuracy_meters != null ? `±${Math.round(selected.last_accuracy_meters)} m` : "—"}</b>
                    </div>
                  </div>
                  <div className="lt-actions">
                    <button type="button" className="lt-action-ghost" disabled title="Employee details page">View Details</button>
                    <button type="button" className="lt-action-primary" onClick={() => setShowRoute(true)}>View Full History</button>
                  </div>
                </>
              )}
            </section>

            <section className="lt-card">
              <div className="lt-card-title">
                <span>Today's Movement</span>
                <input type="date" className="input" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} style={{ width: "auto", height: 36 }} />
              </div>
              {!selected ? (
                <div className="lt-sub">Select an employee to see their movement.</div>
              ) : historyLoading ? (
                <Loading />
              ) : segments.length === 0 ? (
                <div className="lt-sub">No movement recorded for this day.</div>
              ) : (
                <div className="lt-timeline">
                  {segments.map((s, i) => (
                    <div key={`${s.start}-${i}`} className="lt-tl">
                      <span className="lt-tl-time">{fmtTime(s.start)}</span>
                      <span className="lt-tl-dot" style={{ background: s.area_id ? "#1e8e5a" : "#e88a12" }} />
                      <div>
                        <div className="lt-tl-title">
                          {s.area_id ? `At ${s.area}` : "Outside work area"}
                        </div>
                        <div className="lt-sub">
                          {fmtTime(s.end)} · {s.readings} reading(s) · ±{s.max_accuracy} m
                          {s.jumps > 0 ? ` · ${s.jumps} GPS jump(s)` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <aside className="lt-right">
          <section className="lt-card">
            <div className="lt-card-title">
              <span>Employee Roster ({visible.length})</span>
            </div>
            <div className="lt-roster-tabs">
              <button type="button" className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All ({counts.total})</button>
              <button type="button" className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>Online ({counts.online})</button>
              <button type="button" className={tab === "offline" ? "on" : ""} onClick={() => setTab("offline")}>Offline ({counts.offline})</button>
            </div>
            <div className="lt-search">
              <input placeholder="Search employee…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="lt-list">
              {roster.map((r) => (
                <button
                  key={r.employee}
                  type="button"
                  className={`lt-row${selectedId === r.employee ? " on" : ""}`}
                  onClick={() => setSelectedId(r.employee)}
                >
                  <span className="lt-avatar">{initials(r.employee_name)}</span>
                  <span className="lt-row-main">
                    <b>{r.employee_name}</b>
                    <small className="lt-sub">{r.employee_code}</small>
                  </span>
                  <span className="lt-row-side">
                    {pillFor(r)}
                    <span>{r.last_battery_level != null ? `${r.last_battery_level}%` : ""}</span>
                  </span>
                </button>
              ))}
              {roster.length === 0 && <div className="lt-sub">No employees match.</div>}
            </div>
          </section>

          <section className="lt-card">
            <div className="lt-card-title">
              <span>Geofence &amp; Route</span>
            </div>
            <div className="lt-fence-btns">
              <button type="button" className={showFence ? "on" : ""} onClick={() => setShowFence(!showFence)}>
                Show Geofences
              </button>
              <button type="button" className={showRoute ? "on" : ""} disabled={!selected} onClick={() => setShowRoute(!showRoute)}>
                Show Route
              </button>
            </div>
            <div className="lt-summary">
              <div>Total Distance<b>{distanceKm.toFixed(1)} km</b></div>
              <div>Places Visited<b>{placesVisited}</b></div>
              <div>Time in Work Area<b>{fmtDuration(insideMin)}</b></div>
              <div>Outside Area Time<b>{fmtDuration(outsideMin)}</b></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
