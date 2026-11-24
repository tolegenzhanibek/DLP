import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client. Server side only: bypasses RLS. */
export const admin = (): SupabaseClient => createClient(URL_, SERVICE, opts);

/** Anonymous client (same rights as the browser). */
export const anon = (): SupabaseClient => createClient(URL_, ANON, opts);

/** Returns the caller's user id from the Authorization header, or null. */
export async function callerId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
