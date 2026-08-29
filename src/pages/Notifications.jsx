import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  LogIn,
  LogOut,
  Clock3,
  UserX,
  WifiOff,
  SatelliteDish,
} from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Loading, Pager } from "../components/ui";
import { formatDateTime, timeAgo } from "../lib/format";

const PAGE_SIZE = 25;

const TYPE_META = {
  SHIFT_START: { icon: LogIn, tone: "green" },
  SHIFT_END: { icon: LogOut, tone: "slate" },
  GEOFENCE_ENTER: { icon: LogIn, tone: "green" },
  GEOFENCE_EXIT: { icon: LogOut, tone: "red" },
  GPS_DISABLED: { icon: SatelliteDish, tone: "amber" },
  INTERNET_DISCONNECTED: { icon: WifiOff, tone: "red" },
  ABSENT: { icon: UserX, tone: "red" },
  LATE_ARRIVAL: { icon: Clock3, tone: "amber" },
};

export default function Notifications() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(""); // "" | "unread"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE, ordering: "-created_at" };
      if (filter === "unread") params.is_read = false;
      const { data } = await api.get("/notifications/", { params });
      setRows(data.results || data);
      setCount(data.count ?? (data.results || data).length);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load notifications."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  const markOneRead = async (n) => {
    if (n.is_read) return;
    setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
    try {
      await api.post(`/notifications/${n.id}/read/`);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't mark that notification as read."));
      load();
    }
  };

  const markAllRead = async () => {
    setMarking(true);
    setError("");
    try {
      await api.post("/notifications/mark-all-read/");
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't mark all as read."));
    } finally {
      setMarking(false);
    }
  };

  const unreadCount = rows.filter((r) => !r.is_read).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 9</div>
          <h1>Notifications</h1>
          <p className="page-sub">Shift, geofence and device-health events across your workforce.</p>
        </div>
        <button className="btn btn-sm" disabled={marking || unreadCount === 0} onClick={markAllRead}>
          <CheckCheck size={14} />
          {marking ? "Marking…" : "Mark all as read"}
        </button>
      </div>

      <Alert>{error}</Alert>

      <div className="card">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
              <button className={`tab ${filter === "" ? "active" : ""}`} onClick={() => { setPage(1); setFilter(""); }}>
                All
              </button>
              <button className={`tab ${filter === "unread" ? "active" : ""}`} onClick={() => { setPage(1); setFilter("unread"); }}>
                Unread
              </button>
            </div>
          </div>
          <span className="card-head-sub">{count} notification{count === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <Loading label="Loading notifications…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={BellOff} title="Nothing here" message={filter === "unread" ? "No unread notifications." : "No notifications yet."} />
        ) : (
          <>
            <div className="notif-list">
              {rows.map((n) => {
                const meta = TYPE_META[n.notification_type] || { icon: Bell, tone: "slate" };
                const Icon = meta.icon;
                return (
                  <div
                    key={n.id}
                    className={`notif-row${n.is_read ? "" : " unread"}`}
                    onClick={() => markOneRead(n)}
                  >
                    <span className={`notif-icon tone-${meta.tone}`}>
                      <Icon size={15} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="notif-title">{n.title}</div>
                      <div className="notif-body">{n.body}</div>
                      <div className="notif-time">
                        {formatDateTime(n.created_at)} · {timeAgo(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && <span className="notif-dot" title="Unread" />}
                  </div>
                );
              })}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
