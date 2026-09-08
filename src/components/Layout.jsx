import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutGrid,
  Users,
  Building2,
  Hexagon,
  Clock,
  Radar,
  BarChart3,
  Bell,
  Settings as SettingsIcon,
  LogOut,
  ArrowLeftRight,
  PlaneTakeoff,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { initials } from "../lib/format";
import Header from "./Header";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/transfers", label: "Transfer Requests", icon: ArrowLeftRight },
  { to: "/outdoor-duty", label: "Outdoor Duty", icon: PlaneTakeoff },
  { to: "/company", label: "Company Setup", icon: Building2 },
  { to: "/geofences", label: "Geofences", icon: Hexagon },
  { to: "/tracking", label: "Live Tracking", icon: Radar },
  { to: "/attendance", label: "Attendance", icon: Clock },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">
            <Hexagon size={16} color="#eaf3ef" strokeWidth={2.2} />
          </span>
          <div>
            <div className="sidebar-brand-name">GeoWork Pro</div>
            <div className="sidebar-brand-sub">ADMIN PORTAL</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initials(user?.full_name || user?.phone)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{user?.full_name || user?.phone}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-col">
        <Header />
        <Outlet />
      </div>
    </div>
  );
}