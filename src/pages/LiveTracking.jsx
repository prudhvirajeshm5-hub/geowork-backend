import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, InfoWindow, Circle, useJsApiLoader } from "@react-google-maps/api";
import { Radar, RefreshCw, Pause, Play } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Loading, StatusBadge } from "../components/ui";
import { initials, timeAgo } from "../lib/format";

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 };
const REFRESH_MS = 20000;

const CONNECTIVITY = {
  ONLINE: { tone: "green", label: "Online", color: "#4A90E2" },
  OFFLINE: { tone: "slate", label: "Offline", color: "#7c8b88" },
  GPS_DISABLED: { tone: "amber", label: "GPS disabled", color: "#B1690F" },
  INTERNET_DISCONNECTED: { tone: "red", label: "No internet", color: "#A8342B" },
};

function pinIcon(color) {
  return {
    path: "M 0,0 C -6,-10 -10,-15 -10,-20 A 10,10 0 1 1 10,-20 C 10,-15 6,-10 0,0 Z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: 0.9,
  };
}

export default function LiveTracking() {
  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: "geowork-google-maps",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    api.get("/company/branches/", { params: { page_size: 200 } }).then(({ data }) => setBranches(data.results || data));
  }, []);

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const params = { page_size: 200 };
      if (branch) params.branch = branch;
      const { data } = await api.get("/tracking/live/", { params });
      setRows(data.results || data);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load live tracking."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  useEffect(() => {
    if (!live) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, branch]);

  const located = useMemo(() => rows.filter((r) => r.last_latitude != null && r.last_longitude != null), [rows]);
  const center = located[0] ? { lat: located[0].last_latitude, lng: located[0].last_longitude } : DEFAULT_CENTER;

  const onlineCount = rows.filter((r) => r.connectivity_status === "ONLINE").length;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 6</div>
          <h1>Live tracking</h1>
          <p className="page-sub">
            {onlineCount} of {rows.length} employee{rows.length === 1 ? "" : "s"} online right now.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select className="input" style={{ width: 180 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setLive((v) => !v)}>
            {live ? <Pause size={14} /> : <Play size={14} />}
            {live ? "Pause auto-refresh" : "Resume"}
          </button>
          <button className="btn btn-icon" onClick={() => load(true)} title="Refresh now">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, height: 620 }}>
        <div style={{ position: "relative" }}>
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
              center={center}
              zoom={12}
              mapContainerStyle={{ height: "100%", width: "100%" }}
              mapContainerClassName="map-shell"
              options={{ streetViewControl: false, fullscreenControl: true }}
            >
              {located.map((r) => {
                const conn = CONNECTIVITY[r.connectivity_status] || CONNECTIVITY.OFFLINE;
                return (
                  <Marker
                    key={r.employee}
                    position={{ lat: r.last_latitude, lng: r.last_longitude }}
                    icon={pinIcon(conn.color)}
                    onClick={() => setSelected(r)}
                  />
                );
              })}
              {selected?.last_latitude != null && (
                <InfoWindow
                  position={{ lat: selected.last_latitude, lng: selected.last_longitude }}
                  onCloseClick={() => setSelected(null)}
                >
                  <div>
                    <strong>{selected.employee_name}</strong>
                    <br />
                    {(CONNECTIVITY[selected.connectivity_status] || CONNECTIVITY.OFFLINE).label} · {timeAgo(selected.last_ping_at)}
                    <br />
                    {selected.current_work_area_name || "Outside any work area"}
                  </div>
                </InfoWindow>
              )}
              {selected?.last_accuracy_meters && selected.last_latitude != null && (
                <Circle
                  center={{ lat: selected.last_latitude, lng: selected.last_longitude }}
                  radius={selected.last_accuracy_meters}
                  options={{ strokeColor: "#4A90E2", strokeWeight: 1, fillColor: "#4A90E2", fillOpacity: 0.08, clickable: false }}
                />
              )}
            </GoogleMap>
          )}
          <div className="map-legend">
            {Object.entries(CONNECTIVITY).map(([key, v]) => (
              <div className="map-legend-row" key={key}>
                <span className="map-legend-dot" style={{ background: v.color }} />
                {v.label}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="card-head">
            <h3>Roster</h3>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <EmptyState icon={Radar} title="No live data yet" message="Employees will appear here once the mobile app starts reporting location." />
            ) : (
              rows
                .slice()
                .sort((a, b) => (a.connectivity_status === "ONLINE" ? -1 : 1) - (b.connectivity_status === "ONLINE" ? -1 : 1))
                .map((r) => {
                  const conn = CONNECTIVITY[r.connectivity_status] || CONNECTIVITY.OFFLINE;
                  return (
                    <div
                      key={r.employee}
                      onClick={() => setSelected(r)}
                      style={{
                        padding: "11px 18px",
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer",
                        background: selected?.employee === r.employee ? "var(--panel-sunken)" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="sidebar-avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>
                          {initials(r.employee_name)}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="cell-primary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.employee_name}
                          </div>
                          <div className="cell-sub">{r.current_work_area_name || "No active work area"}</div>
                        </div>
                        <StatusBadge tone={conn.tone}>{conn.label}</StatusBadge>
                      </div>
                      <div className="cell-sub" style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                        <span>{timeAgo(r.last_ping_at)}</span>
                        {r.last_battery_level != null && <span>Battery {r.last_battery_level}%</span>}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}