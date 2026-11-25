import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Level } from "../lib/types";
import {
  IconBell, IconChart, IconEdit, IconHistory, IconLogout, IconMenu, IconSettings, IconSidebar,
  IconUser, IconUsers,
} from "./icons";
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
  const isAdmin = profile?.role === "admin";

  const load = useCallback(async () => {
    if (!profile || profile.role === "admin") return;
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

  // The admin account is for analytics only: no document tools, no history.
  const items = isAdmin
    ? [
        { to: "/admin", label: t("admin.overview"), icon: <IconChart />, tour: "nav-admin", badge: 0 },
        { to: "/admin/users", label: t("admin.users"), icon: <IconUsers />, tour: "nav-admin-users", badge: 0 },
      ]
    : [
        { to: "/notifications", label: t("nav.notifications"), icon: <IconBell />, tour: "nav-notifications", badge: unread },
        { to: "/history", label: t("nav.allHistory"), icon: <IconHistory />, tour: "nav-history", badge: 0 },
      ];

  return (
    <>
      <div className="side-top">
        <Link to={isAdmin ? "/admin" : "/app"} className="side-logo" onClick={onNavigate} aria-label="Senim"><Logo size={26} /></Link>
      </div>
      <nav className="side-nav" aria-label="main">
        {!isAdmin && (
          <button type="button" className="side-item" data-tour="nav-scans"
            onClick={() => { onNavigate(); nav("/app", { state: { fresh: Date.now() } }); }}>
            <IconEdit /><span>{t("nav.newScan")}</span>
          </button>
        )}
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end className="side-item" data-tour={it.tour} onClick={onNavigate}>
            <span className="side-icon">
              {it.icon}
              {it.badge ? <span className="nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
            </span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      {isAdmin ? <div className="side-spacer" /> : (
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
      )}
      <AccountMenu onNavigate={onNavigate} />
    </>
  );
}

/** ChatGPT-style account menu on the sidebar's bottom row. */
function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = profile?.display_name || profile?.nickname || "";

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (to: string) => { setOpen(false); onNavigate(); nav(to); };

  return (
    <div className="side-bottom account" ref={ref}>
      {open && (
        <div className="acct-menu" role="menu">
          <button type="button" role="menuitem" className="acct-row" onClick={() => go("/profile")}><IconUser /><span>{t("nav.profile")}</span></button>
          <button type="button" role="menuitem" className="acct-row" onClick={() => go("/settings")}><IconSettings /><span>{t("nav.settings")}</span></button>
          <hr />
          <button type="button" role="menuitem" className="acct-row" onClick={signOut}><IconLogout /><span>{t("settings.signOut")}</span></button>
        </div>
      )}
      <button type="button" className={`side-user${open ? " active" : ""}`} data-tour="nav-settings" aria-haspopup="menu"
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar url={profile?.avatar_url} name={name} size={32} />
        <span className="acct-names"><span className="truncate">{name}</span><span className="muted small truncate">@{profile?.nickname}</span></span>
      </button>
    </div>
  );
}

/** ChatGPT-style shell: same items everywhere; sidebar on desktop, drawer on mobile. */
export function AppShell() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
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
          <Link to={isAdmin ? "/admin" : "/app"} className="topbar-logo mobile-only"><Logo size={22} /></Link>
          {isAdmin ? <span className="icon-btn mobile-only" aria-hidden="true" /> : (
            <button type="button" className="icon-btn mobile-only" aria-label={t("nav.newScan")}
              onClick={() => nav("/app", { state: { fresh: Date.now() } })}>
              <IconEdit />
            </button>
          )}
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** User-only pages (documents, history, notifications): the admin account goes to analytics. */
export function UserOnly() {
  const { profile } = useAuth();
  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  return <Outlet />;
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
