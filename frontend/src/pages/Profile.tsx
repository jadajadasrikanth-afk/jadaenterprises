import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase, callEdgeFunction } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";
import { uploadDocument } from "../lib/storage";

interface ProfileRow {
  id: string;
  mobile_number: string;
  full_name: string | null;
  hotel_name: string | null;
  reference_phone: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  id_proof_file_path: string | null;
  shop_photo_file_path: string | null;
  is_admin: boolean;
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  // Captures whether this was an empty (never-saved) profile the moment it
  // loaded, so "first save" detection isn't fooled by edits made since.
  const wasNewProfile = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return navigate("/login");
      const { data } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
      wasNewProfile.current = !data?.hotel_name;
      setProfile(data as ProfileRow);
    })();
  }, [navigate]);

  async function handleSave() {
    if (!profile) return;
    const isFirstSave = wasNewProfile.current;
    setSaving(true);
    setMessage("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          hotel_name: profile.hotel_name,
          reference_phone: profile.reference_phone,
        })
        .eq("id", profile.id);
      if (error) throw error;
      await callEdgeFunction("log-action", {
        action: isFirstSave ? "profile_created" : "profile_updated",
      });
      wasNewProfile.current = false;
      setMessage("Saved successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function captureLocation() {
    if (!profile) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await supabase
        .from("profiles")
        .update({ gps_lat: latitude, gps_lng: longitude })
        .eq("id", profile.id);
      setProfile({ ...profile, gps_lat: latitude, gps_lng: longitude });
    }, () => setMessage("Could not get location — please allow location access."));
  }

  async function uploadFile(fileType: "id_proof" | "shop_photo", file: File) {
    if (!profile) return;
    try {
      const path = await uploadDocument(profile.id, fileType, file);
      const column = fileType === "id_proof" ? "id_proof_file_path" : "shop_photo_file_path";
      await supabase.from("profiles").update({ [column]: path }).eq("id", profile.id);
      if (fileType === "id_proof") {
        setProfile({ ...profile, id_proof_file_path: path });
      } else {
        setProfile({ ...profile, shop_photo_file_path: path });
      }
      setMessage(`${fileType === "id_proof" ? "ID proof" : "Shop photo"} uploaded.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed — please try again.");
    }
  }

  if (!profile) return <div className="phone">Loading…</div>;

  return (
    <div className="phone">
      <div className="brand">MY PROFILE</div>
      <h1>{profile.mobile_number}</h1>
      {profile.is_admin && (
        <Link to="/admin" style={{ display: "block", marginBottom: 16 }}>
          <button type="button">Go to Admin Dashboard</button>
        </Link>
      )}

      <label>Full Name</label>
      <input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />

      <label>Hotel Name</label>
      <input value={profile.hotel_name ?? ""} onChange={(e) => setProfile({ ...profile, hotel_name: e.target.value })} />

      <label>Reference Phone Number</label>
      <input value={profile.reference_phone ?? ""} onChange={(e) => setProfile({ ...profile, reference_phone: e.target.value })} />

      <div className="card-row">
        <div className="meta">
          <div className="t">ID Proof Photo</div>
          <div className="s">{profile.id_proof_file_path ? "Uploaded ✓" : "Not uploaded"}</div>
        </div>
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => e.target.files?.[0] && uploadFile("id_proof", e.target.files[0])} />
      </div>

      <div className="card-row">
        <div className="meta">
          <div className="t">Counter / Shop Photo</div>
          <div className="s">{profile.shop_photo_file_path ? "Uploaded ✓" : "Not uploaded"}</div>
        </div>
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => e.target.files?.[0] && uploadFile("shop_photo", e.target.files[0])} />
      </div>

      <div className="card-row">
        <div className="meta">
          <div className="t">GPS Location</div>
          <div className="s">
            {profile.gps_lat ? `${profile.gps_lat.toFixed(4)}, ${profile.gps_lng?.toFixed(4)}` : "Not captured"}
          </div>
        </div>
        <button type="button" onClick={captureLocation}>Capture</button>
      </div>

      {message && <div className="message">{message}</div>}
      <button onClick={() => handleSave()} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button className="ghost" onClick={async () => { await signOut(); navigate("/login"); }}>
        Log out
      </button>
    </div>
  );
}
