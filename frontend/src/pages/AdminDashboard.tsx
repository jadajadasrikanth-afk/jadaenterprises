import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, callEdgeFunction, EDGE_FN_URL } from "../lib/supabaseClient";
import { getDocumentUrl } from "../lib/storage";

interface ProfileRow {
  id: string;
  mobile_number: string;
  full_name: string | null;
  hotel_name: string | null;
  reference_phone: string | null;
  is_admin: boolean;
  is_disabled: boolean;
  created_at: string;
  id_proof_file_path: string | null;
  shop_photo_file_path: string | null;
}
interface AuditLog {
  id: string;
  actor_mobile: string | null;
  action: string;
  created_at: string;
}
interface ResetRequest {
  id: string;
  mobile_number: string;
  status: string;
  requested_at: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [resets, setResets] = useState<ResetRequest[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [docUrls, setDocUrls] = useState<{ idProof?: string; shop?: string }>({});
  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminMobile, setAdminMobile] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadAll() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return navigate("/login");
    const { data: me } = await supabase.from("profiles").select("is_admin, mobile_number").eq("id", auth.user.id).single();
    if (!me?.is_admin) return navigate("/profile");
    setAdminId(auth.user.id);
    setAdminMobile(me.mobile_number);

    const [{ data: u }, { data: l }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(15),
      supabase.from("password_reset_requests").select("*").eq("status", "pending").order("requested_at", { ascending: false }),
    ]);
    setUsers(u ?? []);
    setLogs(l ?? []);
    setResets(r ?? []);
  }

  useEffect(() => {
    loadAll();
    // Live updates: new logins/saves appear without refresh
    const channel = supabase
      .channel("admin-audit-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.mobile_number?.toLowerCase().includes(q) ||
      u.hotel_name?.toLowerCase().includes(q) ||
      u.reference_phone?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q)
    );
  });

  async function toggleDisabled(u: ProfileRow) {
    await supabase.from("profiles").update({ is_disabled: !u.is_disabled }).eq("id", u.id);
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_mobile: adminMobile,
      action: u.is_disabled ? "admin_enable" : "admin_disable",
      target_id: u.id,
    });
    loadAll();
  }

  async function deleteUser(u: ProfileRow) {
    if (!confirm(`Delete ${u.mobile_number}? This cannot be undone.`)) return;
    await supabase.from("profiles").delete().eq("id", u.id);
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_mobile: adminMobile,
      action: "admin_delete",
      target_id: u.id,
    });
    loadAll();
  }

  async function sendResetLink(requestId: string) {
    const { resetLink } = await callEdgeFunction("admin-reset-password", { requestId });
    prompt("Copy this link and send it to the user via WhatsApp/SMS:", resetLink);
    loadAll();
  }

  async function viewDocuments(u: ProfileRow) {
    setSelected(u);
    setDocUrls({});
    const results: { idProof?: string; shop?: string } = {};
    if (u.id_proof_file_path) {
      try { results.idProof = await getDocumentUrl(u.id_proof_file_path); } catch { /* not accessible */ }
    }
    if (u.shop_photo_file_path) {
      try { results.shop = await getDocumentUrl(u.shop_photo_file_path); } catch { /* not accessible */ }
    }
    setDocUrls(results);

    // Audit: admin viewing another user's sensitive document
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_mobile: adminMobile,
      action: "admin_view_document",
      target_id: u.id,
    });
  }

  async function exportCsv() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`${EDGE_FN_URL}/export-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users_export.csv";
    a.click();
  }

  const newProfiles7d = users.filter((u) => Date.now() - new Date(u.created_at).getTime() < 7 * 86400000).length;

  return (
    <div className="phone" style={{ maxWidth: 460 }}>
      <h1>Admin Dashboard</h1>

      <div className="stats">
        <div className="stat"><div className="n">{users.length}</div><div className="l">Total Users</div></div>
        <div className="stat"><div className="n">{logs.filter((l) => l.action === "login").length}</div><div className="l">Recent Logins</div></div>
        <div className="stat"><div className="n">{newProfiles7d}</div><div className="l">New Profiles (7d)</div></div>
        <div className="stat"><div className="n">{resets.length}</div><div className="l">Pending Resets</div></div>
      </div>

      <div className="section-title">🔔 Recent Activity</div>
      {logs.map((l) => (
        <div className="alert" key={l.id}>
          <div className="dot"></div>
          <div className="txt"><b>{l.actor_mobile ?? "Unknown"}</b> — {l.action.replace(/_/g, " ")}</div>
          <div className="time">{new Date(l.created_at).toLocaleTimeString()}</div>
        </div>
      ))}

      {resets.length > 0 && (
        <>
          <div className="section-title">🔑 Pending Password Resets</div>
          {resets.map((r) => (
            <div className="row" key={r.id}>
              <div className="info"><div className="t">{r.mobile_number}</div><div className="s">Requested {new Date(r.requested_at).toLocaleString()}</div></div>
              <button className="reset-btn" onClick={() => sendResetLink(r.id)}>Generate Link</button>
            </div>
          ))}
        </>
      )}

      <div className="section-title">👥 All Users</div>
      <input type="search" placeholder="Search by mobile, hotel, or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.map((u) => (
        <div className="row" key={u.id}>
          <div className="info">
            <div className="t">{u.full_name || u.mobile_number}</div>
            <div className="s">{u.mobile_number} • {u.hotel_name ?? "no hotel"}</div>
          </div>
          <span className={`status ${u.is_disabled ? "pending" : "active"}`}>{u.is_disabled ? "Disabled" : "Active"}</span>
        </div>
      ))}
      {filtered.map((u) => (
        <div key={`actions-${u.id}`} style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => viewDocuments(u)}>View</button>
          <button onClick={() => toggleDisabled(u)}>{u.is_disabled ? "Enable" : "Disable"}</button>
          <button onClick={() => deleteUser(u)}>Delete</button>
        </div>
      ))}

      {selected && (
        <div className="section-title">📄 {selected.mobile_number} — Documents</div>
      )}
      {selected && (
        <div>
          {docUrls.idProof ? <p><a href={docUrls.idProof} target="_blank" rel="noreferrer">View ID Proof (link expires in 2 min)</a></p> : <p className="sub">ID proof not uploaded</p>}
          {docUrls.shop ? <p><a href={docUrls.shop} target="_blank" rel="noreferrer">View Shop Photo (link expires in 2 min)</a></p> : <p className="sub">Shop photo not uploaded</p>}
        </div>
      )}

      <div className="section-title">⬇️ Export</div>
      <button onClick={exportCsv}>Export all users to CSV</button>
    </div>
  );
}
