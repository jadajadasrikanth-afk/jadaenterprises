// POST { requestId: string }
// Admin-only. Looks up the pending reset request, generates a Supabase
// recovery link for that user, marks the request "sent", and returns the
// link so the admin can copy/paste it into WhatsApp/SMS themselves.
import { getCallerProfile, getServiceClient, jsonResponse } from "../_shared/authHelper.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";

function mobileToSyntheticEmail(mobile: string) {
  return `${mobile}@fielddata.local`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const caller = await getCallerProfile(req);
  if (!caller || !caller.profile.is_admin) return jsonResponse({ error: "Forbidden" }, 403);

  const { requestId } = await req.json();
  const supabase = getServiceClient();

  const { data: resetReq, error } = await supabase
    .from("password_reset_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (error || !resetReq) return jsonResponse({ error: "Request not found" }, 404);

  const email = mobileToSyntheticEmail(resetReq.mobile_number);

  // generateLink requires the service role key (never exposed to frontend)
  // FRONTEND_URL must be set as a secret, e.g. https://your-app.vercel.app
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${Deno.env.get("FRONTEND_URL")}/reset-password` },
  });
  if (linkErr || !linkData) {
    return jsonResponse({ error: linkErr?.message ?? "Could not generate link" }, 500);
  }

  await supabase
    .from("password_reset_requests")
    .update({ status: "sent", resolved_at: new Date().toISOString(), resolved_by: caller.userId })
    .eq("id", requestId);

  await supabase.from("audit_logs").insert({
    actor_id: caller.userId,
    actor_mobile: caller.profile.mobile_number,
    action: "password_reset_sent",
    details: { mobile: resetReq.mobile_number },
  });

  return jsonResponse({ resetLink: linkData.properties?.action_link });
});
