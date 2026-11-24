// Sign in with nickname OR email. The browser never learns which email belongs to a nickname.
// Captcha is verified by Supabase Auth itself (the token is forwarded to signInWithPassword).
import { admin, anon } from "../_shared/clients.ts";
import { clientIp, corsHeaders, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let body: { identifier?: string; password?: string; captchaToken?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "bad_request" }, 400);
  }
  const identifier = (body.identifier ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!identifier || !password || identifier.length > 254 || password.length > 128) {
    return json(req, { error: "invalid_credentials" }, 400);
  }

  const db = admin();
  const ip = clientIp(req);
  const [{ data: ipOk }, { data: idOk }] = await Promise.all([
    db.rpc("check_rate_limit", { p_key: `login_ip:${ip}`, p_max: 30, p_window_seconds: 900 }),
    db.rpc("check_rate_limit", { p_key: `login_id:${identifier}`, p_max: 10, p_window_seconds: 900 }),
  ]);
  if (ipOk === false || idOk === false) return json(req, { error: "rate_limited" }, 429);

  let email = identifier;
  if (!identifier.includes("@")) {
    const { data } = await db.rpc("resolve_login_email", { p_identifier: identifier });
    if (!data) return json(req, { error: "invalid_credentials" }, 400);
    email = data as string;
  }

  const { data, error } = await anon().auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: body.captchaToken },
  });

  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "email_not_confirmed") {
      // Best effort: re-send the confirmation e-mail (service role is not captcha-gated).
      try {
        await db.auth.resend({ type: "signup", email });
      } catch (_) { /* external mail failure must not break login flow */ }
      return json(req, { error: "email_not_confirmed" }, 400);
    }
    if (code.startsWith("captcha")) return json(req, { error: "captcha_failed" }, 400);
    if (code === "over_request_rate_limit") return json(req, { error: "rate_limited" }, 429);
    return json(req, { error: "invalid_credentials" }, 400);
  }

  return json(req, {
    session: { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token },
  });
});
