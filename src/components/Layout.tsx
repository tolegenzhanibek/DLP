import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { IconBell, IconDoc, IconSettings, IconShield, IconUser } from "./icons";
import { LoadingState, Logo } from "./ui";

/** Same navigation items on every screen size; only the placement changes (sidebar vs bottom bar). */
export function AppShell() {
  const { t } = useTranslation();
  const { profile, unread } = useAuth();
  const items = [
    { to: "/app", label: t("nav.scans"), icon: <IconDoc />, tour: "nav-scans", end: false },
    { to: "/notifications", label: t("nav.notifications"), icon: <IconBell />, tour: "nav-notifications", badge: unread },
    { to: "/profile", label: t("nav.profile"), icon: <IconUser />, tour: "nav-profile" },
    { to: "/settings", label: t("nav.settings"), icon: <IconSettings />, tour: "nav-settings" },
    ...(profile?.role === "admin" ? [{ to: "/admin", label: t("nav.admin"), icon: <IconShield />, tour: "nav-admin" }] : []),
  ];
  return (
    <div className="shell">
      <nav className="nav" aria-label="main">
        <div className="nav-brand"><Logo /></div>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className="nav-item" data-tour={it.tour}>
            <span className="nav-icon">
              {it.icon}
              {it.badge ? <span className="nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
            </span>
            <span className="nav-label">{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
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
  if (profile!.status === "pending") return <Navigate to="/pending" replace />;
  return <Outlet />;
}

/** Logged-in users skip the auth pages. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth();
  if (loading) return <div className="fullscreen"><LoadingState /></div>;
  if (session) return <Navigate to="/app" replace />;
  return <Outlet />;
}
