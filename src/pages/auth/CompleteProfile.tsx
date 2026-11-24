import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Field, LoadingState } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { NICK_RE } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../lib/types";
import { AuthCard } from "./AuthCard";

type NickState = "idle" | "checking" | "free" | "taken" | "invalid";

/** One-time step after Google/GitHub sign-up: pick a real nickname. */
export default function CompleteProfile() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { session, profile, loading, patchProfile, signOut } = useAuth();
  const [nickname, setNickname] = useState("");
  const [nick, setNick] = useState<NickState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile && !profile.nickname.startsWith("user_")) setNickname((n) => n || profile.nickname);
  }, [profile]);

  useEffect(() => {
    const v = nickname.trim().toLowerCase();
    if (!v) return setNick("idle");
    if (!NICK_RE.test(v)) return setNick("invalid");
    if (v === profile?.nickname) return setNick("free");
    setNick("checking");
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("nickname_available", { p_nickname: v });
      setNick(error ? "idle" : data ? "free" : "taken");
    }, 400);
    return () => window.clearTimeout(id);
  }, [nickname, profile?.nickname]);

  if (loading || (session && !profile)) return <div className="fullscreen"><LoadingState /></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile!.needs_setup) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nick !== "free") return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("complete_my_profile", { p_nickname: nickname.trim().toLowerCase() });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    patchProfile(data as Profile);
    nav("/app", { replace: true });
  }

  const nickStatus =
    nick === "free" ? <span className="hint ok">{t("auth.nicknameFree")}</span>
    : nick === "taken" ? <span className="hint bad">{t("auth.nicknameTaken")}</span>
    : nick === "checking" ? <span className="hint">…</span>
    : null;

  return (
    <AuthCard title={t("auth.completeTitle")}
      footer={<button type="button" className="link-btn" onClick={signOut}>{t("settings.signOut")}</button>}>
      <p className="muted">{t("auth.completeText")}</p>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t("auth.nickname")} value={nickname} autoComplete="username" autoCapitalize="off" maxLength={24}
          onChange={(e) => setNickname(e.target.value)} status={nickStatus}
          error={nick === "invalid" ? t("auth.nicknameInvalid") : null} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" block loading={busy}>{t("auth.completeCta")}</Button>
      </form>
    </AuthCard>
  );
}
