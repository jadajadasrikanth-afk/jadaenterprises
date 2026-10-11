import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../lib/auth";

export default function ForgotPassword() {
  const [mobile, setMobile] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await requestPasswordReset(mobile);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (done) {
    return (
      <div className="phone" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1>Request sent</h1>
        <p className="sub">
          The admin has been notified and will send you a reset link on WhatsApp/SMS shortly.
        </p>
        <Link to="/login">Back to login</Link>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="brand">FIELD DATA COLLECT</div>
      <h1>Forgot password</h1>
      <p className="sub">We'll notify the admin to send you a reset link.</p>
      <form onSubmit={handleSubmit}>
        <label>Mobile Number</label>
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" required />
        {error && <div className="error">{error}</div>}
        <button type="submit">Send Request</button>
      </form>
      <div className="footer-link"><Link to="/login">Back to login</Link></div>
    </div>
  );
}
