import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Search, Settings as SettingsIcon } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { initials } from "../lib/format";

const TITLES = {
  "/": "Dashboard",
  "/employees": "Employees",
  "/company": "Company setup",
  "/geofences": "Geofence builder",
  "/attendance": "Attendance",
  "/tracking": "Live tracking",
  "/reports": "Reports",
  "/notifications": "Notifications",
  "/settings": "Settings",
};

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const title = TITLES[location.pathname] || "GeoWork Pro";

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .get("/notifications/unread-count/")
        .then(({ data }) => {
          if (!cancelled) setUnread(data.unread_count || 0);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/employees?q=${encodeURIComponent(q)}` : "/employees");
  };

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>

      <form className="topbar-search" onSubmit={submitSearch}>
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employees by name, code, phone…"
        />
      </form>

      <div className="topbar-actions">
        <button
          className="topbar-icon-btn"
          onClick={() => navigate("/notifications")}
          title={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
        >
          <Bell size={17} />
          {unread > 0 && <span className="topbar-badge">{unread > 99 ? "99+" : unread}</span>}
        </button>

        <div className="topbar-profile" ref={menuRef}>
          <button className="topbar-profile-btn" onClick={() => setMenuOpen((v) => !v)}>
            <span className="sidebar-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
              {initials(user?.full_name || user?.phone)}
            </span>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="topbar-menu">
              <div className="topbar-menu-head">
                <div className="cell-primary">{user?.full_name || user?.phone}</div>
                <div className="cell-sub">{user?.role}</div>
              </div>
              <button
                className="topbar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
              >
                <SettingsIcon size={14} /> Settings
              </button>
              <button
                className="topbar-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
