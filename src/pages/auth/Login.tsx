import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Captcha, captchaRequired, type CaptchaHandle } from "../../components/Captcha";
import { Button, Field, PasswordField } from "../../components/ui";
import { errorText } from "../../lib/errors";
import { callFunction, supabase } from "../../lib/supabase";
import { OAuthButtons } from "../../components/OAuthButtons";
import { AuthCard } from "./AuthCard";

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    if (captchaRequired() && !token) return setError(t("errors.captcha_required"));
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data } = await callFunction<{ session?: { access_token: string; refresh_token: string } }>(
      "login", { identifier: identifier.trim(), password, captchaToken: token }, false,
    );
    if (data.session) {
      const { error } = await supabase.auth.setSession(data.session);
      setBusy(false);
      if (error) return setError(errorText(t, error));
      const from = (loc.state as { from?: string } | null)?.from;
      return nav(from && from.startsWith("/") ? from : "/app", { replace: true });
    }
    setBusy(false);
    captcha.current?.reset();
    if (data.error === "email_not_confirmed") return setInfo(t("errors.email_not_confirmed"));
    setError(errorText(t, data.error ?? "generic"));
  }

  return (
    <AuthCard
      title={t("auth.loginTitle")}
      footer={<>{t("auth.noAccount")} <Link to="/signup">{t("auth.signupCta")}</Link></>}
    >
      <OAuthButtons />
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t("auth.identifier")} value={identifier} autoComplete="username" autoCapitalize="off"
          onChange={(e) => setIdentifier(e.target.value)} />
        <PasswordField label={t("auth.password")} value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)} />
        <div className="row end"><Link to="/forgot-password" className="small">{t("auth.forgot")}</Link></div>
        <Captcha ref={captcha} onToken={setToken} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {info && <p className="form-info" role="status">{info}</p>}
        <Button type="submit" block loading={busy}>{t("auth.loginCta")}</Button>
      </form>
    </AuthCard>
  );
}
