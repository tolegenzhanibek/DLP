// CORS limited to the site origin (+ localhost for development) and JSON helpers.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://senim.app";
const ALLOWED = new Set([
  new URL(SITE_URL).origin,
  "https://senim-delta.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
]);
// Vercel preview deployments of this project (senim-<hash>-<team>.vercel.app).
const PREVIEW = /^https:\/\/senim-[a-z0-9-]+\.vercel\.app$/;

// Auth uses bearer tokens, not cookies, so CORS is not the security boundary here;
// it only limits which sites can call the functions from a browser.
const allowed = (origin: string) => ALLOWED.has(origin) || PREVIEW.test(origin);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed(origin) ? origin : new URL(SITE_URL).origin,
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
