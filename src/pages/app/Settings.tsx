import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft, IconArrowUpRight, IconChevron, IconEdit, IconKey, IconLogout, IconSettings, IconSun, IconUser,
} from "../../components/icons";
import { Avatar, Button, ErrorState, Field, LoadingState, Modal, PasswordField, toast } from "../../components/ui";
import { setLanguage, type Lang } from "../../i18n";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { fmtDate, fmtDateTime } from "../../lib/format";
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

type Section = "security" | "account" | "general" | "appearance";
const SECTIONS: Section[] = ["security", "account", "general", "appearance"];

/** ChatGPT-style settings: its own left navigation and one section per page. */
export default function Settings() {
  const { t } = useTranslation();
  const { section } = useParams();
  const { profile } = useAuth();
  if (!profile) return <div className="fullscreen"><LoadingState /></div>;
  if (section && !SECTIONS.includes(section as Section)) return <Navigate to="/settings" replace />;
  const current = (section as Section | undefined) ?? "account";
  const name = profile.display_name || profile.nickname;
  const home = profile.role === "admin" ? "/admin" : "/app";
  const icons: Record<Section, ReactNode> = {
    security: <IconKey />, account: <IconUser />, general: <IconSettings />, appearance: <IconSun />,
  };
  const item = (s: Section) => (
    <NavLink key={s} to={`/settings/${s}`} className={`side-item${!section && s === "account" ? " index-active" : ""}`}>
      {icons[s]}<span>{t(`settings.s_${s}`)}</span>
    </NavLink>
  );

  return (
    <div className={`settings-shell${section ? " has-section" : ""}`}>
      <aside className="settings-nav">
        <Link to={home} className="side-item settings-back"><IconArrowLeft /><span>{t("settings.back")}</span></Link>
        <div className="side-label">{t("nav.profile")}</div>
        <Link to="/profile" className="side-item">
          <Avatar url={profile.avatar_url} name={name} size={24} /><span className="truncate">{name}</span>
          <IconArrowUpRight className="muted settings-ext" />
        </Link>
        <div className="side-label">{t("settings.g_account")}</div>
        {item("security")}{item("account")}
        <div className="side-label">{t("settings.g_app")}</div>
        {item("general")}{item("appearance")}
      </aside>
      <main className="settings-main">
        <Link to="/settings" className="settings-mback"><IconArrowLeft /><span>{t("settings.title")}</span></Link>
        <header className="settings-head">
          <h1>{t(`settings.s_${current}`)}</h1>
          <p className="muted">{t(`settings.d_${current}`)}</p>
        </header>
        {current === "security" && <Security />}
        {current === "account" && <Account profile={profile} />}
        {current === "general" && <General profile={profile} />}
        {current === "appearance" && <Appearance profile={profile} />}
      </main>
    </div>
  );
}

function useSave() {
  const { t } = useTranslation();
  const { patchProfile } = useAuth();
  return useCallback(async (patch: Partial<Profile>) => {
    patchProfile(patch); // optimistic merge
    const { error } = await supabase.rpc("update_my_settings", { p: patch });
    if (error) toast(errorText(t, error), "error");
  }, [patchProfile, t]);
}

function Row({ title, desc, children, onClick }: { title: string; desc?: string; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <div className="srow-text"><b>{title}</b>{desc && <span className="muted">{desc}</span>}</div>
      <div className="srow-value">{children}</div>
    </>
  );
  return onClick
    ? <button type="button" className="srow clickable" onClick={onClick}>{body}</button>
    : <div className="srow">{body}</div>;
}

function Security() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <>
      <section className="sgroup">
        <h2>{t("settings.signInMethods")}</h2>
        <Row title={t("settings.password")} desc={t("settings.passwordDesc")} onClick={() => setPwOpen(true)}>
          <span>{t("settings.change")}</span><IconChevron />
        </Row>
      </section>
      <Sessions />
      <section className="sgroup">
        <Row title={t("settings.signOut")} desc={t("settings.signOutDesc")}>
          <Button variant="secondary" onClick={signOut}><IconLogout /> {t("settings.signOut")}</Button>
        </Row>
      </section>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </>
  );
}

function Account({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { patchProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.display_name ?? "");
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    const { data, error } = await supabase.rpc("update_my_profile", { p: { display_name: name } });
    setBusy(false);
    if (error) return toast(errorText(t, error), "error");
    patchProfile(data as Profile);
    setEditing(false);
  }

  return (
    <section className="sgroup">
      <h2>{t("settings.details")}</h2>
      <Row title={t("profile.displayName")} desc={t("settings.nameDesc")}>
        <span className="truncate">{profile.display_name || "—"}</span>
        <button type="button" className="icon-btn" aria-label={t("profile.displayName")}
          onClick={() => { setName(profile.display_name ?? ""); setEditing(true); }}><IconEdit /></button>
      </Row>
      <Row title={t("auth.nickname")} desc={t("settings.nicknameDesc")}><span>@{profile.nickname}</span></Row>
      {profile.email && <Row title={t("auth.email")} desc={t("settings.emailDesc")}><span className="truncate">{profile.email}</span></Row>}
      <Row title={t("settings.memberSince")} desc={t("settings.memberSinceDesc")}><span>{fmtDate(profile.created_at)}</span></Row>
      <Modal open={editing} title={t("profile.displayName")} onClose={() => setEditing(false)} onDone={saveName} doneLoading={busy}>
        <Field label={t("profile.displayName")} value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
      </Modal>
    </section>
  );
}

function General({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const save = useSave();
  return (
    <section className="sgroup">
      <Row title={t("settings.language")} desc={t("settings.languageDesc")}>
        <select className="pill-select" aria-label={t("settings.language")} value={profile.language}
          onChange={(e) => { const v = e.target.value as Lang; setLanguage(v); void save({ language: v }); }}>
          <option value="kk">Қазақша</option><option value="ru">Русский</option><option value="en">English</option>
        </select>
      </Row>
      {profile.role !== "admin" && (
        <Row title={t("settings.tour")} desc={t("settings.tourDesc")} onClick={() => nav("/app?tour=1")}>
          <IconChevron />
        </Row>
      )}
    </section>
  );
}

function Appearance({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const save = useSave();
  return (
    <section className="sgroup">
      <h2>{t("settings.visual")}</h2>
      <div className="srow srow-wrap">
        <div className="srow-text"><b>{t("settings.theme")}</b><span className="muted">{t("settings.themeDesc")}</span></div>
        <div className="theme-cards" role="radiogroup" aria-label={t("settings.theme")}>
          {(["system", "light", "dark"] as Theme[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={profile.theme === v} aria-label={t(`settings.${v}`)}
              title={t(`settings.${v}`)} className={`theme-card theme-${v}${profile.theme === v ? " active" : ""}`}
              onClick={() => { setTheme(v); void save({ theme: v }); }}>
              <span className="tc-preview"><span className="tc-side" /><span className="tc-line l1" /><span className="tc-line l2" /><span className="tc-line l3" /></span>
              <span className="tc-label">{t(`settings.${v}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
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
    <section className="sgroup">
      <h2>{t("settings.sessions")}</h2>
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
    </section>
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
