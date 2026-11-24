import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { IconLock, IconShield } from "../../components/icons";
import { Button, Logo } from "../../components/ui";
import { useAuth } from "../../lib/auth";

function Shell({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="auth">
      <Link to="/" className="auth-logo" aria-label="Senim"><Logo size={32} /></Link>
      <div className="card auth-card center stack">
        <div className="state-icon big">{icon}</div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {children}
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <Shell icon={<span className="big-code">404</span>} title={t("pages.notFoundTitle")} text={t("pages.notFoundText")}>
      <Link to="/" className="btn btn-primary btn-block">{t("common.home")}</Link>
    </Shell>
  );
}

export function Blocked() {
  const { t } = useTranslation();
  const { profile, session, signOut } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (profile && profile.status !== "blocked") return <Navigate to="/app" replace />;
  return (
    <Shell icon={<IconLock />} title={t("pages.blockedTitle")} text={profile?.blocked_reason || t("pages.blockedText")}>
      <Button variant="secondary" block onClick={signOut}>{t("settings.signOut")}</Button>
    </Shell>
  );
}

export function Pending() {
  const { t } = useTranslation();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => void refreshProfile(), 30_000);
    return () => window.clearInterval(id);
  }, [refreshProfile]);
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.status === "active") return <Navigate to="/app" replace />;
  if (profile?.status === "blocked") return <Navigate to="/blocked" replace />;
  return (
    <Shell icon={<IconShield />} title={t("pages.pendingTitle")} text={t("pages.pendingText")}>
      <Button block loading={busy} onClick={async () => { setBusy(true); await refreshProfile(); setBusy(false); }}>
        {t("pages.refresh")}
      </Button>
      <Button variant="ghost" block onClick={signOut}>{t("settings.signOut")}</Button>
    </Shell>
  );
}
