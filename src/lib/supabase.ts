import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// Only the public anon key lives in the browser. The service_role key is never used here.
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "public-anon-key-missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "implicit" },
});

export const FUNCTIONS_URL = `${url ?? "http://localhost:54321"}/functions/v1`;
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** Calls an edge function; returns parsed JSON and HTTP status. Never throws on HTTP errors. */
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: unknown,
  withAuth = true,
): Promise<{ status: number; data: T & { error?: string } }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key ?? "" };
  if (withAuth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  } else {
    headers.Authorization = `Bearer ${key ?? ""}`;
  }
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ error: "generic" }))) as T & { error?: string };
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { error: "network" } as T & { error?: string } };
  }
}
