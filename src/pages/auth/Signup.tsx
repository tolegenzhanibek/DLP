import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Captcha, captchaRequired, type CaptchaHandle } from "../../components/Captcha";
import { Button, Field, PasswordField } from "../../components/ui";
import { errorText } from "../../lib/errors";
import { EMAIL_RE, NICK_RE, normalizePhone, PHONE_RE } from "../../lib/format";
import { SITE_URL, supabase } from "../../lib/supabase";
import { OAuthButtons } from "../../components/OAuthButtons";
import { AuthCard } from "./AuthCard";

type NickState = "idle" | "checking" | "free" | "taken" | "invalid";

export default function Signup() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [nickname, setNickname] = useState("");
  const [nick, setNick] = useState<NickState>("idle");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  // Live nickname availability (debounced).
  useEffect(() => {
    const v = nickname.trim().toLowerCase();
    if (!v) return setNick("idle");
    if (!NICK_RE.test(v)) return setNick("invalid");
    setNick("checking");
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("nickname_available", { p_nickname: v });
      if (!error) setNick(data ? "free" : "taken");
      else setNick("idle");
    }, 400);
    return () => window.clearTimeout(id);
  }, [nickname]);

  const errs = {
    email: !EMAIL_RE.test(email.trim()) ? t("errors.email_invalid") : null,
    phone: !PHONE_RE.test(normalizePhone(phone)) ? t("errors.phone_invalid") : null,
    password: password.length < 8 ? t("errors.password_short") : null,
  };
  const valid = nick === "free" && !errs.email && !errs.phone && !errs.password && (!captchaRequired() || token);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) {
      if (captchaRequired() && !token) setError(t("errors.captcha_required"));
      return;
    }
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        captchaToken: token ?? undefined,
        emailRedirectTo: `${SITE_URL}/confirm-email`,
        data: { nickname: nickname.trim().toLowerCase(), phone: normalizePhone(phone), language: i18n.language },
      },
    });
    setBusy(false);
    if (error) {
      captcha.current?.reset();
      return setError(errorText(t, error));
    }
    nav("/check-email", { state: { email: cleanEmail } });
  }

  const nickStatus =
    nick === "free" ? <span className="hint ok">{t("auth.nicknameFree")}</span>
    : nick === "taken" ? <span className="hint bad">{t("auth.nicknameTaken")}</span>
    : nick === "checking" ? <span className="hint">…</span>
    : null;

  return (
    <AuthCard
      title={t("auth.signupTitle")}
      footer={<>{t("auth.haveAccount")} <Link to="/login">{t("auth.loginCta")}</Link></>}
    >
      <OAuthButtons />
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t("auth.nickname")} value={nickname} autoComplete="username" autoCapitalize="off"
          onChange={(e) => setNickname(e.target.value)} status={nickStatus}
          error={nick === "invalid" ? t("auth.nicknameInvalid") : null} maxLength={24} />
        <Field label={t("auth.email")} type="email" value={email} autoComplete="email" inputMode="email"
          onChange={(e) => setEmail(e.target.value)} error={touched ? errs.email : null} />
        <Field label={t("auth.phone")} type="tel" value={phone} autoComplete="tel" inputMode="tel"
          placeholder="+7 7__ ___ __ __" onChange={(e) => setPhone(e.target.value)} error={touched ? errs.phone : null} />
        <PasswordField label={t("auth.password")} value={password} autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)}
          error={touched ? errs.password : null} />
        <Captcha ref={captcha} onToken={setToken} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" block loading={busy}>{t("auth.signupCta")}</Button>
      </form>
    </AuthCard>
  );
}
