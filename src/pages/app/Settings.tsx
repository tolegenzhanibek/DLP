import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { IconChevron, IconLogout } from "../../components/icons";
import { Button, ErrorState, LoadingState, Modal, PasswordField, Segmented, toast } from "../../components/ui";
import { setLanguage, type Lang } from "../../i18n";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { fmtDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { setTheme } from "../../lib/theme";
import type { Profile, Theme } from "../../lib/types";

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
}

function deviceName(ua: string | null, fallback: string) {
  if (!ua) return fallback;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ") || fallback;
}

export default function Settings() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { profile, patchProfile, signOut } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);

  const save = useCallback(async (patch: Partial<Profile>) => {
    patchProfile(patch); // optimistic merge
    const { error } = await supabase.rpc("update_my_settings", { p: patch });
    if (error) toast(errorText(t, error), "error");
  }, [patchProfile, t]);

  if (!profile) return <LoadingState />;

  // Everything lives in one card, separated only by thin dividers.
  return (
    <div className="page">
      <header className="page-head"><h1>{t("settings.title")}</h1></header>

      <div className="card settings-card">
        <div className="setting">
          <span>{t("settings.theme")}</span>
          <Segmented<Theme> label={t("settings.theme")} value={profile.theme}
            onChange={(v) => { setTheme(v); void save({ theme: v }); }}
            options={(["light", "dark", "system"] as Theme[]).map((v) => ({ value: v, label: t(`settings.${v}`) }))} />
        </div>
        <div className="setting">
          <span>{t("settings.language")}</span>
          <Segmented<Lang> label={t("settings.language")} value={profile.language}
            onChange={(v) => { setLanguage(v); void save({ language: v }); }}
            options={[{ value: "kk", label: "Қазақша" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} />
        </div>
        <button type="button" className="setting-row" onClick={() => nav("/app?tour=1")}>
          <span>{t("settings.tour")}</span><IconChevron className="muted" />
        </button>
        <button type="button" className="setting-row" onClick={() => setPwOpen(true)}>
          <span>{t("settings.changePassword")}</span><IconChevron className="muted" />
        </button>
        <Sessions />
        <button type="button" className="setting-row" onClick={signOut}>
          <span className="row gap-sm"><IconLogout /> {t("settings.signOut")}</span>
        </button>
      </div>

      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function Sessions() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.rpc("my_sessions");
    if (error) return setFailed(true);
    setRows(data as SessionRow[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    const { error } = await supabase.rpc("revoke_my_session", { p_session: id });
    if (error) return toast(errorText(t, error), "error");
    setRows((r) => r?.filter((x) => x.id !== id) ?? r);
  }
  async function revokeOthers() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return toast(errorText(t, error), "error");
    void load();
  }

  return (
    <div className="setting">
      <span>{t("settings.sessions")}</span>
      {failed ? <ErrorState onRetry={load} /> : rows === null ? <LoadingState /> : (
        <div className="session-list">
          {rows.map((s) => (
            <div key={s.id} className="session-row">
              <div className="list-main">
                <b>{deviceName(s.user_agent, t("settings.unknownDevice"))}</b>
                <span className="muted small">
                  {s.is_current ? t("settings.current") : fmtDateTime(s.updated_at ?? s.created_at)}{s.ip ? ` · ${s.ip}` : ""}
                </span>
              </div>
              {!s.is_current && <Button variant="ghost" onClick={() => revoke(s.id)}>{t("settings.revoke")}</Button>}
            </div>
          ))}
          {rows.length > 1 && (
            <button type="button" className="link-btn session-others" onClick={revokeOthers}>{t("settings.revokeOthers")}</button>
          )}
        </div>
      )}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (next.length < 8) return setError(t("errors.password_short"));
    if (next !== confirm) return setError(t("errors.password_mismatch"));
    setBusy(true);
    setError(null);
    const { data: ok, error: e1 } = await supabase.rpc("verify_my_password", { p_password: current });
    if (e1 || !ok) {
      setBusy(false);
      return setError(e1 ? errorText(t, e1) : t("errors.wrong_password"));
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    toast(t("settings.passwordChanged"));
    onClose();
  }

  return (
    <Modal open title={t("settings.changePassword")} onClose={onClose} onDone={submit} doneLoading={busy}
      doneDisabled={!current || !next || !confirm}>
      <div className="stack">
        <PasswordField label={t("profile.currentPassword")} value={current} autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)} visible={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />
        {/* New password + confirmation share one eye. */}
        <PasswordField label={t("auth.newPassword")} value={next} autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)} visible={showNew} onToggle={() => setShowNew(!showNew)} />
        <PasswordField label={t("auth.passwordConfirm")} value={confirm} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)} visible={showNew} onToggle={() => setShowNew(!showNew)} showEye={false} />
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
