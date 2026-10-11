import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../lib/auth";

export default function Signup() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await signUp(mobile, password);
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="phone">
      <div className="brand">FIELD DATA COLLECT</div>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit}>
        <label>Mobile Number</label>
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        <label>Confirm Password</label>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? "Creating…" : "Continue"}</button>
      </form>
      <div className="footer-link">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </div>
  );
}
