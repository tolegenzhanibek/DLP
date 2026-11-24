import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Captcha, captchaRequired, type CaptchaHandle } from "../../components/Captcha";
import { Button, Field } from "../../components/ui";
import { errorText } from "../../lib/errors";
import { EMAIL_RE } from "../../lib/format";
import { SITE_URL, supabase } from "../../lib/supabase";
import { AuthCard } from "./AuthCard";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError(t("errors.email_invalid"));
    if (captchaRequired() && !token) return setError(t("errors.captcha_required"));
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      captchaToken: token ?? undefined,
      redirectTo: `${SITE_URL}/reset-password`,
    });
    setBusy(false);
    captcha.current?.reset();
    if (error) return setError(errorText(t, error));
    setSent(true);
  }

  return (
    <AuthCard title={t("auth.forgotTitle")} footer={<Link to="/login">{t("auth.toLogin")}</Link>}>
      {sent ? (
        <p className="form-info" role="status">{t("auth.linkSent")}</p>
      ) : (
        <form onSubmit={submit} noValidate className="stack">
          <Field label={t("auth.email")} type="email" value={email} autoComplete="email" inputMode="email"
            onChange={(e) => setEmail(e.target.value)} />
          <Captcha ref={captcha} onToken={setToken} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" block loading={busy}>{t("auth.sendLink")}</Button>
        </form>
      )}
    </AuthCard>
  );
}
