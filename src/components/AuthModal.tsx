import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { errorText } from "../lib/errors";
import { EMAIL_RE, NICK_RE } from "../lib/format";
import { callFunction, SITE_URL, supabase } from "../lib/supabase";
import { Captcha, captchaRequired, type CaptchaHandle } from "./Captcha";
import { IconX } from "./icons";
import { OAuthButtons } from "./OAuthButtons";
import { Button, Field, PasswordField } from "./ui";

type Step = "start" | "password" | "signup";
type NickState = "idle" | "checking" | "free" | "taken" | "invalid";

/** "Log in or sign up": social buttons, then e-mail first; the server says which step comes next. */
export function AuthModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [step, setStep] = useState<Step>("start");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nick, setNick] = useState<NickState>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Live nickname availability on the sign-up step.
  useEffect(() => {
    if (step !== "signup") return;
    const v = nickname.trim().toLowerCase();
    if (!v) return setNick("idle");
    if (!NICK_RE.test(v)) return setNick("invalid");
    setNick("checking");
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("nickname_available", { p_nickname: v });
      setNick(error ? "idle" : data ? "free" : "taken");
    }, 400);
    return () => window.clearTimeout(id);
  }, [nickname, step]);

  const goto = (s: Step) => {
    setStep(s);
    setError(null);
    setInfo(null);
    setTouched(false);
    setPassword("");
  };

  async function checkIdentifier(e: FormEvent) {
    e.preventDefault();
    const v = identifier.trim();
    if (!v) return;
    if (v.includes("@") ? !EMAIL_RE.test(v) : !NICK_RE.test(v.toLowerCase())) {
      return setError(t("errors.email_invalid"));
    }
    setBusy(true);
    setError(null);
    const { data } = await callFunction<{ exists?: boolean }>("login", { action: "check", identifier: v }, false);
    setBusy(false);
    if (data.error) return setError(errorText(t, data.error));
    if (data.exists) return goto("password");
    // Unknown nickname cannot start a sign-up: sign-up needs an e-mail.
    if (!v.includes("@")) return setError(t("errors.invalid_credentials"));
    goto("signup");
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
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

  const pwErr = password.length < 8 ? t("errors.password_short") : null;

  async function signup(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nick !== "free" || pwErr) return;
    if (captchaRequired() && !token) return setError(t("errors.captcha_required"));
    setBusy(true);
    setError(null);
    const email = identifier.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: token ?? undefined,
        emailRedirectTo: `${SITE_URL}/confirm-email`,
        data: { nickname: nickname.trim().toLowerCase(), language: i18n.language },
      },
    });
    setBusy(false);
    if (error) {
      captcha.current?.reset();
      return setError(errorText(t, error));
    }
    nav("/check-email", { state: { email } });
  }

  const nickStatus =
    nick === "free" ? <span className="hint ok">{t("auth.nicknameFree")}</span>
    : nick === "taken" ? <span className="hint bad">{t("auth.nicknameTaken")}</span>
    : nick === "checking" ? <span className="hint">…</span>
    : null;

  const idChip = (
    <div className="id-chip">
      <span className="truncate">{identifier.trim()}</span>
      <button type="button" className="link-btn" onClick={() => goto("start")}>{t("auth.change")}</button>
    </div>
  );

  return createPortal(
    <div className="modal-backdrop auth-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="icon-btn auth-close" aria-label={t("common.close")} onClick={onClose}>
          <IconX />
        </button>

        {step === "start" && (
          <>
            <h2 id="auth-title">{t("auth.modalTitle")}</h2>
            <p className="auth-sub">{t("auth.modalText")}</p>
            <OAuthButtons />
            <form onSubmit={checkIdentifier} noValidate className="stack-sm">
              <input className="pill-input" type="text" inputMode="email" autoComplete="username" autoCapitalize="off"
                placeholder={t("auth.emailOrNick")} aria-label={t("auth.emailOrNick")} value={identifier}
                onChange={(e) => setIdentifier(e.target.value)} autoFocus />
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button type="submit" block loading={busy} className="btn-dark btn-pill btn-tall">{t("auth.continue")}</Button>
            </form>
          </>
        )}

        {step === "password" && (
          <>
            <h2 id="auth-title">{t("auth.enterPassword")}</h2>
            {idChip}
            <form onSubmit={login} noValidate className="stack-sm">
              <PasswordField label={t("auth.password")} value={password} autoComplete="current-password" autoFocus
                onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)} />
              <div className="row end"><Link to="/forgot-password" className="small">{t("auth.forgot")}</Link></div>
              <Captcha ref={captcha} onToken={setToken} />
              {error && <p className="form-error" role="alert">{error}</p>}
              {info && <p className="form-info" role="status">{info}</p>}
              <Button type="submit" block loading={busy} className="btn-dark btn-pill btn-tall">{t("auth.continue")}</Button>
            </form>
          </>
        )}

        {step === "signup" && (
          <>
            <h2 id="auth-title">{t("auth.createAccount")}</h2>
            {idChip}
            <form onSubmit={signup} noValidate className="stack-sm">
              <Field label={t("auth.nickname")} value={nickname} autoComplete="username" autoCapitalize="off" maxLength={24}
                onChange={(e) => setNickname(e.target.value)} status={nickStatus} autoFocus
                error={nick === "invalid" ? t("auth.nicknameInvalid") : null} />
              <PasswordField label={t("auth.password")} value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)}
                error={touched ? pwErr : null} />
              <Captcha ref={captcha} onToken={setToken} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button type="submit" block loading={busy} className="btn-dark btn-pill btn-tall">{t("auth.signupCta")}</Button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
