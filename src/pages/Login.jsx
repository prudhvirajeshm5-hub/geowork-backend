
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Hexagon, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiErrorMessage } from "../lib/api";

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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const user = await login(phone.trim(), password, remember);

      if (user.role === "EMPLOYEE") {
        setError(
          "Employee accounts cannot access this admin portal. Please use the GeoWork Pro mobile app."
        );
        return;
      }

      navigate(location.state?.from?.pathname || "/", {
        replace: true,
      });
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          "Login failed. Please check your phone number and password."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-visual">
        <div className="login-visual-inner">
          <Hexagon size={48} color="#7fd6bb" />

          <h2>Every check-in starts at a boundary.</h2>

          <p>
            GeoWork Pro brings geofenced attendance, employee
            tracking, and workforce reporting into one console.
          </p>
        </div>
      </section>

      <section className="login-form-col">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-brand">
            <span className="sidebar-brand-mark">
              <Hexagon size={16} color="#eaf3ef" />
            </span>

            <div>
              <div className="login-brand-name">GeoWork Pro</div>
              <div className="login-brand-sub">Admin Portal</div>
            </div>
          </div>

          <h1>Welcome back</h1>

          <p className="login-sub">
            Sign in with your registered phone number and password.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                color: "#b42318",
                background: "#fff1f0",
                padding: "12px",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="phone">Phone number</label>

            <input
              id="phone"
              name="phone"
              className="input"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="password">Password</label>

            <div className="password-input">
              <input
                id="password"
                name="password"
                className="input"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </div>
          </div>

          <label
            className="checkbox-row"
            style={{ marginBottom: 20, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember me on this device
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
            }}
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign in"}

            {!submitting && <ArrowRight size={16} />}
          </button>

          <p className="login-foot">
            Forgot your password? Contact your company administrator.
          </p>

          <p className="login-foot">
            New to GeoWork Pro?{" "}
            <Link to="/register">Create an account</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
