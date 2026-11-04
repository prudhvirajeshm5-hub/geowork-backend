
import { useEffect, useMemo, useState } from "react";
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Users, UserCheck, Briefcase, UserX, CalendarClock, MessageSquareWarning, MapPin } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Loading } from "../components/ui";
import "../dashboard.css";

const MAPS_OPTIONS = {
  id: "geowork-maps",
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
};
const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 };
const COLORS = { online: "#1e8e5a", outside: "#e88a12", offline: "#d64541" };
const LABELS = { online: "Online", outside: "Outdoor", offline: "Offline" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "outside", label: "Outdoor" },
  { key: "offline", label: "Offline" },
];

function initialsOf(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function markerImage(status) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">` +
    `<circle cx="17" cy="17" r="13" fill="${COLORS[status]}" stroke="#ffffff" stroke-width="3"/></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}` };
}

function statusOf(r) {
  if (!r.is_online) return "offline";
  if (!r.current_work_area && !r.current_work_area_name) return "outside";
  return "online";
}

function StatCard({ icon: Icon, tone, label, value }) {
  return (
    <div className="dash-stat">
      <span className={`dash-stat-icon dash-tone-${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <div className="dash-stat-label">{label}</div>
        <div className="dash-stat-value">{value}</div>
      </div>
    </div>
  );
}

function Highlight({ icon: Icon, tone, text }) {
  return (
    <div className="dash-highlight">
      <span className={`dash-stat-icon dash-tone-${tone} dash-highlight-icon`}>
        <Icon size={16} />
      </span>
      <span>{text}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { isLoaded, loadError } = useJsApiLoader(MAPS_OPTIONS);
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState([]);
  const [leavesPending, setLeavesPending] = useState(0);
  const [complaintsOpen, setComplaintsOpen] = useState(0);
  const [filter, setFilter] = useState("all");
  const [info, setInfo] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sumRes, liveRes, leaveRes, compRes] = await Promise.all([
        api.get("/dashboard/summary/"),
        api.get("/tracking/live/", { params: { page_size: 200 } }),
        api.get("/leaves/pending/").catch(() => ({ data: { results: [] } })),
        api.get("/complaints/company/", { params: { status: "OPEN" } }).catch(() => ({ data: { results: [] } })),
      ]);
      setSummary(sumRes.data);
      setLive(liveRes.data.results || liveRes.data);
      setLeavesPending((leaveRes.data.results || []).length);
      setComplaintsOpen((compRes.data.results || []).length);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load the dashboard right now."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const located = useMemo(
    () => live.filter((r) => r.last_latitude != null && r.last_longitude != null),
    [live]
  );

  const counts = useMemo(() => {
    const c = { all: live.length, online: 0, outside: 0, offline: 0 };
    live.forEach((r) => {
      c[statusOf(r)] += 1;
    });
    return c;
  }, [live]);

  const shown = filter === "all" ? located : located.filter((r) => statusOf(r) === filter);

  const fitToEmployees = (map) => {
    setMapRef(map);
    if (!window.google || located.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    located.forEach((r) => bounds.extend({ lat: r.last_latitude, lng: r.last_longitude }));
    map.fitBounds(bounds, 60);
  };

  const focusEmployee = (r) => {
    setInfo(r);
    if (mapRef) {
      mapRef.panTo({ lat: r.last_latitude, lng: r.last_longitude });
    }
  };

  const total = summary?.total_employees ?? 0;
  const presentToday = (summary?.present ?? 0) + (summary?.late ?? 0) + (summary?.half_day ?? 0);
  const pct = total ? Math.round((presentToday / total) * 100) : 0;
  const outsideNow = summary?.outside_work_area ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ring = 2 * Math.PI * 46;

  const renderMap = () => {
    if (loadError) {
      return <div className="dash-map-msg">Google Maps couldn't load. Check the Maps API key.</div>;
    }
    if (!isLoaded) {
      return <Loading />;
    }
    return (
      <GoogleMap
        mapContainerStyle={{ height: "100%", width: "100%" }}
        center={DEFAULT_CENTER}
        zoom={12}
        onLoad={fitToEmployees}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      >
        {shown.map((r) => {
          const st = statusOf(r);
          return (
            <Marker
              key={r.employee}
              position={{ lat: r.last_latitude, lng: r.last_longitude }}
              icon={markerImage(st)}
              label={{ text: initialsOf(r.employee_name), color: "#ffffff", fontSize: "10px", fontWeight: "700" }}
              onClick={() => setInfo(r)}
            />
          );
        })}
        {info && (
          <InfoWindow
            position={{ lat: info.last_latitude, lng: info.last_longitude }}
            onCloseClick={() => setInfo(null)}
          >
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong>{info.employee_name}</strong> ({info.employee_code})
              <br />
              {LABELS[statusOf(info)]}
              {info.current_work_area_name ? ` · ${info.current_work_area_name}` : ""}
              <br />
              Last update: {info.minutes_since_last_ping != null ? `${info.minutes_since_last_ping} min ago` : "—"}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    );
  };

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div>
        <div className="dash-greet">{greeting}</div>
        <div className="dash-name">{user?.first_name || "Admin"}</div>
        <div className="dash-date">{dateLabel}</div>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && !summary ? (
        <Loading />
      ) : (
        <>
          <div className="dash-stats">
            <StatCard icon={Users} tone="blue" label="Total Employees" value={total} />
            <StatCard icon={UserCheck} tone="green" label="Present Today" value={presentToday} />
            <StatCard icon={Briefcase} tone="amber" label="Outside Work Area" value={outsideNow} />
            <StatCard icon={UserX} tone="red" label="Absent Today" value={summary?.absent ?? 0} />
          </div>

          <div className="dash-grid">
            <section className="dash-card">
              <h3>Live Employee Locations</h3>
              <div className="dash-chips">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`dash-chip${filter === f.key ? " on" : ""}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} ({counts[f.key]})
                  </button>
                ))}
              </div>
              <div className="dash-map">{renderMap()}</div>
              <div className="dash-legend">
                <span>
                  <i style={{ background: COLORS.online }} />
                  Online
                </span>
                <span>
                  <i style={{ background: COLORS.outside }} />
                  Outdoor
                </span>
                <span>
                  <i style={{ background: COLORS.offline }} />
                  Offline
                </span>
              </div>

              <div className="dash-loc-list">
                {shown.length === 0 ? (
                  <div className="dash-loc-sub">No employees with a recorded location yet.</div>
                ) : (
                  shown.map((r) => {
                    const st = statusOf(r);
                    return (
                      <button key={r.employee} type="button" className="dash-loc-row" onClick={() => focusEmployee(r)}>
                        <span>
                          <span className="dash-loc-name">{r.employee_name}</span>
                          <span className="dash-loc-sub">
                            {" "}
                            {r.employee_code} · {r.last_latitude.toFixed(5)}, {r.last_longitude.toFixed(5)}
                            {r.minutes_since_last_ping != null ? ` · ${r.minutes_since_last_ping} min ago` : ""}
                          </span>
                        </span>
                        <span className={`dash-loc-pill ${st}`}>{LABELS[st]}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <aside>
              <section className="dash-card">
                <h3>Today's Attendance</h3>
                <div className="dash-donut-row">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="46" stroke="#e6ebf3" strokeWidth="12" fill="none" />
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      stroke="#1e8e5a"
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(pct / 100) * ring} ${ring}`}
                      transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="66" textAnchor="middle" fontSize="20" fontWeight="800" fill="#18223a">
                      {pct}%
                    </text>
                  </svg>
                  <ul>
                    <li>
                      <span className="dot g" /> Present <b>{summary?.present ?? 0}</b>
                    </li>
                    <li>
                      <span className="dot a" /> Late <b>{summary?.late ?? 0}</b>
                    </li>
                    <li>
                      <span className="dot o" /> Outside <b>{outsideNow}</b>
                    </li>
                    <li>
                      <span className="dot r" /> Absent <b>{summary?.absent ?? 0}</b>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="dash-card">
                <h3>Today's Highlights</h3>
                <Highlight
                  icon={CalendarClock}
                  tone="amber"
                  text={`${leavesPending} leave request${leavesPending === 1 ? "" : "s"} pending`}
                />
                <Highlight
                  icon={MessageSquareWarning}
                  tone="red"
                  text={`${complaintsOpen} open complaint${complaintsOpen === 1 ? "" : "s"}`}
                />
                <Highlight
                  icon={MapPin}
                  tone="blue"
                  text={`${outsideNow} employee${outsideNow === 1 ? "" : "s"} outside work area`}
                />
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
