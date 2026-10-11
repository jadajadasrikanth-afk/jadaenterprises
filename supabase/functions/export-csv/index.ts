// GET — admin only. Returns a CSV of all users.
// Deliberately EXCLUDES id_proof_file_path (and any raw document data) —
// only a metadata export, never the sensitive document itself.
import { getCallerProfile, getServiceClient, jsonResponse } from "../_shared/authHelper.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

function toCsvValue(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const caller = await getCallerProfile(req);
  if (!caller || !caller.profile.is_admin) return jsonResponse({ error: "Forbidden" }, 403);

  const supabase = getServiceClient();
  const { data: rows, error } = await supabase
    .from("profiles")
    .select(
      "mobile_number, full_name, hotel_name, reference_phone, gps_lat, gps_lng, is_disabled, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) return jsonResponse({ error: error.message }, 500);

  const headers = [
    "mobile_number", "full_name", "hotel_name", "reference_phone",
    "gps_lat", "gps_lng", "is_disabled", "created_at", "updated_at",
  ];
  const csvLines = [
    headers.join(","),
    ...rows.map((r: Record<string, unknown>) => headers.map((h) => toCsvValue(r[h])).join(",")),
  ];

  await supabase.from("audit_logs").insert({
    actor_id: caller.userId,
    actor_mobile: caller.profile.mobile_number,
    action: "admin_export",
    details: { rowCount: rows.length },
  });

  return new Response(csvLines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=users_export.csv",
      ...corsHeaders,
    },
  });
});
