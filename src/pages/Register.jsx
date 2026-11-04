
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Hexagon, ArrowRight } from "lucide-react";
import api, { apiErrorMessage, setTokens } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Register() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data } = await api.post("/auth/register/", {
        ...form,
        role: "MANAGER",
      });

      setTokens({
        access: data.access,
        refresh: data.refresh,
      });

      await refreshUser();

      navigate("/company", { replace: true });
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          "Registration failed. Please check your details and try again."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-visual">
        <div className="login-visual-inner">
          <Hexagon size={48} color="#7fd6bb" />

          <h2>Bring your workforce into view.</h2>

          <p>
            Manage attendance, work locations, employees and field
            operations from one GeoWork Pro console.
          </p>
        </div>
      </div>

      <div className="login-form-col">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-brand">
            <span className="sidebar-brand-mark">
              <Hexagon
                size={16}
                color="#eaf3ef"
                strokeWidth={2.2}
              />
            </span>

            <div>
              <div className="login-brand-name">GeoWork Pro</div>
              <div className="login-brand-sub">Create your account</div>
            </div>
          </div>

          <h1>Get started</h1>

          <p className="login-sub">
            Create an account to start setting up your workspace.
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

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="first_name">First name</label>

            <input
              id="first_name"
              className="input"
              name="first_name"
              type="text"
              placeholder="Enter first name"
              value={form.first_name}
              onChange={updateField}
              autoComplete="given-name"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="last_name">Last name</label>

            <input
              id="last_name"
              className="input"
              name="last_name"
              type="text"
              placeholder="Enter last name"
              value={form.last_name}
              onChange={updateField}
              autoComplete="family-name"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="phone">Phone number</label>

            <input
              id="phone"
              className="input"
              name="phone"
              type="tel"
              placeholder="+919876543210"
              value={form.phone}
              onChange={updateField}
              autoComplete="tel"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email address</label>

            <input
              id="email"
              className="input"
              name="email"
              type="email"
              placeholder="Enter email address"
              value={form.email}
              onChange={updateField}
              autoComplete="email"
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="password">Password</label>

            <input
              id="password"
              className="input"
              name="password"
              type="password"
              placeholder="Create a strong password"
              value={form.password}
              onChange={updateField}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
            }}
            disabled={submitting}
          >
            {submitting ? "Creating account..." : "Create account"}

            {!submitting && <ArrowRight size={15} />}
          </button>

          <p className="login-foot">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
