import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Level } from "../lib/types";
import { IconBell, IconEdit, IconHistory, IconMenu, IconSettings, IconShield, IconSidebar } from "./icons";
import { Avatar, LoadingState, Logo } from "./ui";

interface RecentScan {
  id: string;
  file_name: string;
  final_level: Level;
}

/** Fired after a new scan is saved so the sidebar history refreshes. */
export const SCANS_CHANGED = "senim:scans-changed";

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { profile, unread } = useAuth();
  const nav = useNavigate();
  const [recent, setRecent] = useState<RecentScan[] | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("scans")
      .select("id,file_name,final_level")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setRecent((data as RecentScan[]) ?? []);
  }, [profile]);

  useEffect(() => {
    void load();
    window.addEventListener(SCANS_CHANGED, load);
    return () => window.removeEventListener(SCANS_CHANGED, load);
  }, [load]);

  const items = [
    { to: "/notifications", label: t("nav.notifications"), icon: <IconBell />, tour: "nav-notifications", badge: unread },
    { to: "/history", label: t("nav.allHistory"), icon: <IconHistory />, tour: "nav-history" },
    ...(profile?.role === "admin" ? [{ to: "/admin", label: t("nav.admin"), icon: <IconShield />, tour: "nav-admin" }] : []),
  ];
  const name = profile?.display_name || profile?.nickname || "";

  return (
    <>
      <div className="side-top">
        <Link to="/app" className="side-logo" onClick={onNavigate} aria-label="Senim"><Logo size={26} /></Link>
      </div>
      <nav className="side-nav" aria-label="main">
        <button type="button" className="side-item" data-tour="nav-scans"
          onClick={() => { onNavigate(); nav("/app", { state: { fresh: Date.now() } }); }}>
          <IconEdit /><span>{t("nav.newScan")}</span>
        </button>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className="side-item" data-tour={it.tour} onClick={onNavigate}>
            <span className="side-icon">
              {it.icon}
              {it.badge ? <span className="nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
            </span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="side-section" data-tour="history">
        <div className="side-label">{t("nav.history")}</div>
        {recent === null ? null : recent.length === 0 ? (
          <p className="side-empty">{t("scan.noHistory")}</p>
        ) : (
          recent.map((s) => (
            <NavLink key={s.id} to={`/app/scans/${s.id}`} className="side-item side-history" onClick={onNavigate}
              title={s.file_name}>
              <span className={`dot-level level-${s.final_level}`} aria-label={t(`levels.${s.final_level}`)} />
              <span className="truncate">{s.file_name}</span>
            </NavLink>
          ))
        )}
      </div>
      <div className="side-bottom">
        <Link to="/profile" className="side-user" onClick={onNavigate}>
          <Avatar url={profile?.avatar_url} name={name} size={32} />
          <span className="truncate">{name}</span>
        </Link>
        <NavLink to="/settings" className="icon-btn side-settings" data-tour="nav-settings" onClick={onNavigate}
          aria-label={t("nav.settings")} title={t("nav.settings")}>
          <IconSettings />
        </NavLink>
      </div>
    </>
  );
}

/** ChatGPT-style shell: same items everywhere; sidebar on desktop, drawer on mobile. */
export function AppShell() {
  const { t } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar") === "collapsed";
    } catch {
      return false;
    }
  });

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem("sidebar", collapsed ? "collapsed" : "open");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <aside className={`sidebar${open ? " open" : ""}`}>
        <button type="button" className="icon-btn side-toggle" aria-label={t("nav.menu")}
          onClick={() => (window.innerWidth < 768 ? setOpen(false) : setCollapsed(true))}>
          <IconSidebar />
        </button>
        <Sidebar onNavigate={() => setOpen(false)} />
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main-col">
        <header className="topbar">
          <button type="button" className={`icon-btn${collapsed ? "" : " mobile-only"}`} aria-label={t("nav.menu")}
            onClick={() => (window.innerWidth < 768 ? setOpen(true) : setCollapsed(false))}>
            {collapsed ? <IconSidebar /> : <IconMenu />}
          </button>
          <Link to="/app" className="topbar-logo mobile-only"><Logo size={22} /></Link>
          <button type="button" className="icon-btn mobile-only" aria-label={t("nav.newScan")}
            onClick={() => nav("/app", { state: { fresh: Date.now() } })}>
            <IconEdit />
          </button>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PublicShell() {
  return (
    <div className="public">
      <Outlet />
    </div>
  );
}

/** Requires a session and an ACTIVE account; routes pending/blocked users to their pages. */
export function RequireActive() {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading || (session && !profile)) return <div className="fullscreen"><LoadingState /></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (profile!.status === "blocked") return <Navigate to="/blocked" replace />;
  if (profile!.needs_setup) return <Navigate to="/complete-profile" replace />;
  return <Outlet />;
}

/** Logged-in users skip the auth pages. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth();
  if (loading) return <div className="fullscreen"><LoadingState /></div>;
  if (session) return <Navigate to="/app" replace />;
  return <Outlet />;
}
