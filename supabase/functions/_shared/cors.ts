// Every Edge Function needs these headers or the browser blocks the
// request as cross-origin (the frontend and the Supabase Functions domain
// are different origins). Also required: answering the OPTIONS preflight
// request that browsers send before the real POST/GET.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
