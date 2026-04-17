import React, { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../WorkspaceTheme.css";

// ── Password strength scorer (mirrors backend rules) ────────────────────────
function scorePassword(pw) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  const checks = {
    length:    pw.length >= 8,
    upper:     /[A-Z]/.test(pw),
    lower:     /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
    longEnough: pw.length >= 12,
  };
  if (checks.length)     score++;
  if (checks.upper)      score++;
  if (checks.lower)      score++;
  if (checks.number)     score++;
  if (checks.special)    score++;
  if (checks.longEnough) score++;   // bonus

  const clamp = Math.min(score, 5); // cap display at 5
  const levels = [
    { label: "",          color: "" },
    { label: "Very Weak", color: "#ef4444" },
    { label: "Weak",      color: "#f97316" },
    { label: "Fair",      color: "#eab308" },
    { label: "Good",      color: "#84cc16" },
    { label: "Strong",    color: "#22c55e" },
  ];
  return { score: clamp, label: levels[clamp].label, color: levels[clamp].color, checks };
}

function StrengthMeter({ password }) {
  const { score, label, color, checks } = useMemo(() => scorePassword(password), [password]);
  if (!password) return null;

  const bars = [1, 2, 3, 4, 5];

  return (
    <div style={{ marginTop: 8 }}>
      {/* Bar row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {bars.map(n => (
          <div key={n} style={{
            flex: 1, height: 5, borderRadius: 3,
            background: n <= score ? color : "#e2e8f0",
            transition: "background 0.25s",
          }} />
        ))}
      </div>

      {/* Label */}
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
      )}

      {/* Checklist */}
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {[
          { key: "length",  text: "At least 8 characters" },
          { key: "upper",   text: "One uppercase letter (A–Z)" },
          { key: "number",  text: "One number (0–9)" },
          { key: "special", text: "One special character (!@#$…)" },
        ].map(({ key, text }) => (
          <span key={key} style={{
            fontSize: 11.5,
            color: checks?.[key] ? "#16a34a" : "#94a3b8",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {checks?.[key] ? "✓" : "○"} {text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
function RegisterPage() {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  const { score, checks } = useMemo(() => scorePassword(password), [password]);
  const strongEnough = score >= 4 &&
    checks?.length && checks?.upper && checks?.number && checks?.special;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!strongEnough) {
      setError("Please choose a stronger password — meet all the requirements below.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); return; }
      navigate("/login");
    } catch {
      setError("Unable to connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h2>CAR Proofreader</h2>
          <p>Create your account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="John Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Min. 8 chars, mixed case, number & symbol"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <StrengthMeter password={password} />
          </div>

          <div className="auth-field">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm && confirm !== password && (
              <span style={{ fontSize: 12, color: "#dc2626", marginTop: 4, display: "block" }}>
                ✗ Passwords do not match
              </span>
            )}
            {confirm && confirm === password && (
              <span style={{ fontSize: 12, color: "#16a34a", marginTop: 4, display: "block" }}>
                ✓ Passwords match
              </span>
            )}
          </div>

          <button
            className="auth-btn"
            type="submit"
            disabled={loading || !strongEnough || password !== confirm}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="auth-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
