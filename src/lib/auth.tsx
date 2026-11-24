import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setLanguage } from "../i18n";
import { supabase } from "./supabase";
import { setTheme } from "./theme";
import type { AppNotification, Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  unread: number;
  refreshProfile: () => Promise<void>;
  /** Merge a partial update instead of replacing: private fields are never lost. */
  patchProfile: (patch: Partial<Profile>) => void;
  setUnread: (n: number | ((n: number) => number)) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const userId = session?.user.id;
  const applied = useRef<string | null>(null);

  const patchProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_profile");
    if (!error && data) setProfile((prev) => ({ ...(prev ?? {}), ...(data as Profile) }));
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setUnread(0);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load profile + unread count once per user.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await refreshProfile();
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled) {
        setUnread(count ?? 0);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshProfile]);

  // Apply server-side preferences (theme, language) once after login.
  useEffect(() => {
    if (profile && applied.current !== profile.id) {
      applied.current = profile.id;
      setTheme(profile.theme);
      setLanguage(profile.language);
    }
  }, [profile]);

  // Realtime notifications: bump the counter and refresh account state on approval/block.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setUnread((n) => n + 1);
          const n = payload.new as AppNotification;
          if (n.kind === "account_approved" || n.kind === "account_blocked") void refreshProfile();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshProfile]);

  // Presence heartbeat for "online" status.
  useEffect(() => {
    if (!userId) return;
    const ping = () => document.visibilityState === "visible" && void supabase.rpc("touch_last_seen");
    ping();
    const id = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, unread, refreshProfile, patchProfile, setUnread, signOut }),
    [session, profile, loading, unread, refreshProfile, patchProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
