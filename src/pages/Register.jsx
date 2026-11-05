import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Hexagon, ArrowRight } from "lucide-react";
import api, { apiErrorMessage, setTokens } from "../lib/api";
import { useAuth } from "../lib/auth";

const EMPTY = {
  company_name: "",
  gstin: "",
  contact_email: "",
  contact_phone: "",
  timezone: "Asia/Kolkata",
  registered_address: "",
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  password: "",
};

export default function Register() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // No role is sent. The server makes this user the ADMIN of the new company.
      const { data } = await api.post("/auth/register-company/", form);
      setTokens({ access: data.access, refresh: data.refresh });
      await refreshUser();
      navigate("/company", { replace: true });
    } catch (err) {
      setError(
        apiErrorMessage(err, "We could not create your company. Please check the details and try again.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  const field = (label, name, props = {}) => (
    <div className="field" style={{ marginBottom: 14 }}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        className="input"
        name={name}
        value={form[name]}
        onChange={update}
        {...props}
      />
    </div>
  );

  return (
    <div className="login-screen">
      <div className="login-visual">
        <div className="login-visual-inner">
          <Hexagon size={48} color="#7fd6bb" />
          <h2>Bring your workforce into view.</h2>
          <p>
            Set up your company, branches and departments, then add your
            employees. You will be the admin of your company.
          </p>
        </div>
      </div>

      <div className="login-form-col">
        <form className="login-card" onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
          <div className="login-brand">
            <span className="sidebar-brand-mark">
              <Hexagon size={16} color="#eaf3ef" strokeWidth={2.2} />
            </span>
            <div>
              <div className="login-brand-name">GeoWork Pro</div>
              <div className="login-brand-sub">Create your company</div>
            </div>
          </div>

          <h1>Get started</h1>
          <p className="login-sub">Tell us about your company and your admin account.</p>

          {error && (
            <div role="alert" style={{ color: "#b42318", background: "#fff1f0", padding: "12px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}

          <h3 style={{ margin: "8px 0 12px" }}>Your company</h3>
          {field("Company name", "company_name", { required: true, placeholder: "e.g. Autocare Inspection Services" })}
          {field("GSTIN (optional)", "gstin", { placeholder: "15-character GSTIN" })}
          {field("Company email", "contact_email", { type: "email", placeholder: "office@yourcompany.com" })}
          {field("Company phone", "contact_phone", { type: "tel" })}
          {field("Registered address", "registered_address", { placeholder: "Street, city, state" })}

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="timezone">Timezone</label>
            <select id="timezone" className="input" name="timezone" value={form.timezone} onChange={update}>
              <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
            </select>
          </div>

          <h3 style={{ margin: "20px 0 12px" }}>Your admin account</h3>
          {field("First name", "first_name", { required: true, autoComplete: "given-name" })}
          {field("Last name", "last_name", { autoComplete: "family-name" })}
          {field("Phone number", "phone", { type: "tel", required: true, autoComplete: "tel", placeholder: "10-digit mobile number" })}
          {field("Email address (optional)", "email", { type: "email", autoComplete: "email" })}
          {field("Password", "password", { type: "password", required: true, autoComplete: "new-password", placeholder: "Create a strong password" })}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            disabled={submitting}
          >
            {submitting ? "Creating your company..." : "Create company"}
            {!submitting && <ArrowRight size={15} />}
          </button>

          <p className="login-foot">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
