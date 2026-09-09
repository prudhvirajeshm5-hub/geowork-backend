import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiErrorMessage } from "../lib/api";
import { Alert } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(phone.trim(), password, remember);
      if (user.role === "EMPLOYEE") {
        setError("This portal is built for managers and admins. Use the Miracle 5 mobile app to check in and out.");
        setSubmitting(false);
        return;
      }
      const dest = location.state?.from?.pathname || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't sign you in. Check your phone number and password."));
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-visual">
        <div className="login-visual-inner">
          <svg viewBox="0 0 420 420" className="geofence-art" aria-hidden="true">
            <polygon
              points="210,40 360,140 330,340 90,340 60,140"
              fill="none"
              stroke="#93c44f"
              strokeWidth="2"
              strokeDasharray="7 6"
              className="geofence-path"
            />
            <polygon points="210,40 360,140 330,340 90,340 60,140" fill="#2c3a56" fillOpacity="0.08" />
            {[
              [210, 40],
              [360, 140],
              [330, 340],
              [90, 340],
              [60, 140],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4.5" fill="#eaf3ef" />
            ))}
            <circle cx="205" cy="205" r="5.5" fill="#fff" />
            <circle cx="205" cy="205" r="16" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5">
              <animate attributeName="r" values="10;46;10" dur="3.4s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="3.4s" repeatCount="indefinite" />
            </circle>
          </svg>
          <h2>Every check-in starts at a boundary.</h2>
          <p>
            Miracle 5 watches the perimeter so you don't have to — geofenced attendance, live field
            visibility, and reporting in one console.
          </p>
        </div>
      </div>

      <div className="login-form-col">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-brand">
            <img src="/miracle5-logo.png" alt="Miracle 5" className="sidebar-brand-mark" style={{ width: 32, height: 32, objectFit: "contain" }} />
            <div>
              <div className="login-brand-name">Miracle 5</div>
              <div className="login-brand-sub">Admin Portal</div>
            </div>
          </div>

          <h1>Sign in</h1>
          <p className="login-sub">Enter the phone number and password on your admin account.</p>

          <Alert>{error}</Alert>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              className="input"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="password">Password</label>
            <div className="password-input">
              <input
                id="password"
                className="input"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <label className="checkbox-row" style={{ marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
            {!submitting && <ArrowRight size={15} />}
          </button>

          <p className="login-foot">Forgot your password or need OTP sign-in? Ask your company admin.</p>
        </form>
      </div>
    </div>
  );
}
