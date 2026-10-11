import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// Service-role client — full DB access. NEVER expose this key to the frontend.
// Only ever used inside Edge Functions.
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Verifies the caller's JWT (from the Authorization header) and returns
// their user id + profile row (including is_admin / is_disabled).
export async function getCallerProfile(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return null;

  const supabase = getServiceClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile) return null;

  return { userId: userData.user.id, profile };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
