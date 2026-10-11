import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signIn } from "../lib/auth";
import { supabase, callEdgeFunction } from "../lib/supabaseClient";

export default function Login() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await signIn(mobile, password);
      await callEdgeFunction("log-action", { action: "login" }).catch(() => {});

      const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
      navigate(me?.is_admin ? "/admin" : "/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="phone">
      <div className="brand">FIELD DATA COLLECT</div>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label>Mobile Number</label>
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? "Logging in…" : "Log in"}</button>
      </form>
      <div className="footer-link">
        New here? <Link to="/signup">Create an account</Link><br />
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}
