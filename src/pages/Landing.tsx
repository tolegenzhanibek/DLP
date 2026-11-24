import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "../components/AuthModal";
import { Composer } from "../components/Composer";
import { IconLock, IconShieldCheck, IconSparkle, IconUsers } from "../components/icons";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Logo } from "../components/ui";
import { useAuth } from "../lib/auth";

/** Logged-out home: the same composer as inside the app; sending leads to sign-up. */
export default function Landing({ auth = false }: { auth?: boolean }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const nav = useNavigate();
  if (session) return <Navigate to="/app" replace />;

  const features = [
    { icon: <IconSparkle />, title: t("landing.f1t") },
    { icon: <IconShieldCheck />, title: t("landing.f2t") },
    { icon: <IconLock />, title: t("landing.f3t") },
    { icon: <IconUsers />, title: t("landing.f4t") },
  ];

  return (
    <div className="landing">
      <header className="landing-head">
        <Logo />
        <div className="row gap-sm">
          <LanguageSwitch />
          <Link to="/login" className="btn btn-dark btn-pill">{t("landing.login")}</Link>
          <Link to="/signup" className="btn btn-outline btn-pill hide-xs">{t("landing.signupFree")}</Link>
        </div>
      </header>
      <section className="hero-center">
        <h1 className="hero-title">{t("landing.title")}</h1>
        <p className="hero-sub">{t("landing.subtitle")}</p>
        <Composer onText={() => nav("/signup")} placeholder={t("landing.composerPlaceholder")} />
        <div className="feature-chips">
          {features.map((f) => (
            <span key={f.title} className="feature-chip">{f.icon}{f.title}</span>
          ))}
        </div>
        <Link to="/signup" className="btn btn-primary btn-pill show-xs">{t("landing.signupFree")}</Link>
      </section>
      <footer className="landing-foot">{t("landing.footer")}</footer>
      {auth && <AuthModal onClose={() => nav("/", { replace: true })} />}
    </div>
  );
}
