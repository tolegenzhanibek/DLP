// CORS limited to the site origin (+ localhost for development) and JSON helpers.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://senim.app";
const ALLOWED = new Set([new URL(SITE_URL).origin, "http://localhost:5173", "http://localhost:4173"]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.has(origin) ? origin : new URL(SITE_URL).origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
