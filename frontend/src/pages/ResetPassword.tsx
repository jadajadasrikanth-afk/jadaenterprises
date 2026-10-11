import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Reached when a user opens the recovery link the admin sent them.
// Supabase puts a temporary recovery session in the URL hash automatically;
// supabase-js picks it up on load, so by the time this page renders the
// user is briefly authenticated just enough to set a new password.
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) return setError(updateErr.message);
    setDone(true);
    setTimeout(() => navigate("/login"), 2000);
  }

  if (done) {
    return (
      <div className="phone" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1>Password updated</h1>
        <p className="sub">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="brand">FIELD DATA COLLECT</div>
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit}>
        <label>New Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        <label>Confirm Password</label>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
        {error && <div className="error">{error}</div>}
        <button type="submit">Update Password</button>
      </form>
    </div>
  );
}
