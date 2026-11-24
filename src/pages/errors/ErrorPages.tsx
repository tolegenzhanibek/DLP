import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { IconLock } from "../../components/icons";
import { Button } from "../../components/ui";
import { AuthCard } from "../auth/AuthCard";
import { useAuth } from "../../lib/auth";

function Shell({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <AuthCard title={title} icon={icon}>
      <p className="auth-sub">{text}</p>
      <div className="stack-sm">{children}</div>
    </AuthCard>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <Shell icon={<span className="big-code">404</span>} title={t("pages.notFoundTitle")} text={t("pages.notFoundText")}>
      <Link to="/" className="btn btn-dark btn-pill btn-tall btn-block">{t("common.home")}</Link>
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
      <Button variant="secondary" block onClick={signOut} className="btn-outline btn-pill btn-tall">{t("settings.signOut")}</Button>
    </Shell>
  );
}

/** Sign-ups are no longer approved manually; old links land in the app. */
export function Pending() {
  return <Navigate to="/app" replace />;
}
