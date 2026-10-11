import { createClient } from "@supabase/supabase-js";

// Only the ANON key goes in the frontend — never the service_role key.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function callEdgeFunction(name: string, body: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(`${EDGE_FN_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}
