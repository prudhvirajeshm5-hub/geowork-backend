import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import { Radar, RefreshCw, Pause, Play } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Loading, StatusBadge } from "../components/ui";
import { initials, timeAgo } from "../lib/format";

const DEFAULT_CENTER = [18.5204, 73.8567];
const REFRESH_MS = 20000;

const CONNECTIVITY = {
  ONLINE: { tone: "green", label: "Online", color: "#0F6E5C" },
  OFFLINE: { tone: "slate", label: "Offline", color: "#7c8b88" },
  GPS_DISABLED: { tone: "amber", label: "GPS disabled", color: "#B1690F" },
  INTERNET_DISCONNECTED: { tone: "red", label: "No internet", color: "#A8342B" },
};

function pin(color) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
  });
}

export default function LiveTracking() {
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
  const center = located[0] ? [located[0].last_latitude, located[0].last_longitude] : DEFAULT_CENTER;

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
          <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} className="map-shell">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {located.map((r) => {
              const conn = CONNECTIVITY[r.connectivity_status] || CONNECTIVITY.OFFLINE;
              return (
                <Marker
                  key={r.employee}
                  position={[r.last_latitude, r.last_longitude]}
                  icon={pin(conn.color)}
                  eventHandlers={{ click: () => setSelected(r) }}
                >
                  <Popup>
                    <strong>{r.employee_name}</strong>
                    <br />
                    {conn.label} · {timeAgo(r.last_ping_at)}
                    <br />
                    {r.current_work_area_name || "Outside any work area"}
                  </Popup>
                </Marker>
              );
            })}
            {selected?.last_accuracy_meters && selected.last_latitude != null && (
              <Circle
                center={[selected.last_latitude, selected.last_longitude]}
                radius={selected.last_accuracy_meters}
                pathOptions={{ color: "#0F6E5C", weight: 1, fillOpacity: 0.08, dashArray: "4 4" }}
              />
            )}
          </MapContainer>
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
