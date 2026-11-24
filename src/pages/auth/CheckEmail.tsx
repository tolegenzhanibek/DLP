import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Captcha, captchaRequired, type CaptchaHandle } from "../../components/Captcha";
import { Button } from "../../components/ui";
import { IconMail } from "../../components/icons";
import { errorText } from "../../lib/errors";
import { SITE_URL, supabase } from "../../lib/supabase";
import { AuthCard } from "./AuthCard";

export default function CheckEmail() {
  const { t } = useTranslation();
  const email = (useLocation().state as { email?: string } | null)?.email;
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const captcha = useRef<CaptchaHandle>(null);
  if (!email) return <Navigate to="/signup" replace />;

  async function resend() {
    if (captchaRequired() && !token) return setMsg({ ok: false, text: t("errors.captcha_required") });
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup", email: email!,
      options: { captchaToken: token ?? undefined, emailRedirectTo: `${SITE_URL}/confirm-email` },
    });
    setBusy(false);
    captcha.current?.reset();
    setMsg(error ? { ok: false, text: errorText(t, error) } : { ok: true, text: t("auth.resent") });
  }

  return (
    <AuthCard title={t("auth.checkEmailTitle")} icon={<IconMail />} footer={<Link to="/login">{t("auth.toLogin")}</Link>}>
      <div className="stack-sm">
        <p className="auth-sub">{t("auth.checkEmailText", { email })}</p>
        <Captcha ref={captcha} onToken={setToken} />
        {msg && <p className={msg.ok ? "form-info" : "form-error"} role="status">{msg.text}</p>}
        <Button variant="secondary" block loading={busy} onClick={resend} className="btn-outline btn-pill btn-tall">{t("auth.resend")}</Button>
      </div>
    </AuthCard>
  );
}
