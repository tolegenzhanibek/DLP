import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IconLock, IconShieldCheck, IconSparkle, IconUsers } from "../components/icons";
import { Logo } from "../components/ui";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { useAuth } from "../lib/auth";

export default function Landing() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const features = [
    { icon: <IconSparkle />, title: t("landing.f1t"), text: t("landing.f1") },
    { icon: <IconShieldCheck />, title: t("landing.f2t"), text: t("landing.f2") },
    { icon: <IconLock />, title: t("landing.f3t"), text: t("landing.f3") },
    { icon: <IconUsers />, title: t("landing.f4t"), text: t("landing.f4") },
  ];
  return (
    <div className="landing">
      <header className="landing-head">
        <Logo />
        <div className="row gap-sm">
          <LanguageSwitch />
          {!session && <Link to="/login" className="btn btn-ghost">{t("landing.login")}</Link>}
        </div>
      </header>
      <section className="hero">
        <h1>{t("landing.title")}</h1>
        <p>{t("landing.subtitle")}</p>
        <Link to={session ? "/app" : "/signup"} className="btn btn-primary btn-lg">{t("landing.cta")}</Link>
      </section>
      <section className="features">
        {features.map((f) => (
          <div key={f.title} className="card feature">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>
      <footer className="landing-foot">© {new Date().getFullYear()} Senim</footer>
    </div>
  );
}
