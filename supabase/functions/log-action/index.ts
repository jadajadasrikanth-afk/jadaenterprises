// POST { action: "login" | "profile_created" | "profile_updated", details?: object }
// Called by the frontend right after a successful login/save/update.
// Writes an audit_logs row and, for signup/update, emails the admin via Resend.
import { getCallerProfile, getServiceClient, jsonResponse } from "../_shared/authHelper.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";

const NOTIFY_ACTIONS = new Set(["profile_created", "profile_updated"]); // keep "login" silent to avoid noise

async function sendAdminEmail(subject: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("ADMIN_ALERT_EMAIL");
  if (!apiKey || !adminEmail) return; // not configured yet — skip silently

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "alerts@yourdomain.example",
      to: adminEmail,
      subject,
      text,
    }),
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const caller = await getCallerProfile(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);

  const { action, details } = await req.json();
  const allowed = ["login", "profile_created", "profile_updated"];
  if (!allowed.includes(action)) return jsonResponse({ error: "Invalid action" }, 400);

  const supabase = getServiceClient();
  await supabase.from("audit_logs").insert({
    actor_id: caller.userId,
    actor_mobile: caller.profile.mobile_number,
    action,
    target_id: caller.userId,
    details: details ?? null,
  });

  if (NOTIFY_ACTIONS.has(action)) {
    const verb = action === "profile_created" ? "created a new profile" : "updated their profile";
    await sendAdminEmail(
      `[Field Data] ${caller.profile.mobile_number} ${verb}`,
      `User ${caller.profile.mobile_number} (${caller.profile.hotel_name ?? "no hotel set"}) ${verb} at ${new Date().toISOString()}.`,
    );
  }

  return jsonResponse({ ok: true });
});
