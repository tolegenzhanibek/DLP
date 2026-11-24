import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { AvatarCropper } from "../../components/AvatarCropper";
import { IconLink, IconLock, IconMail, IconMapPin, IconPhone, IconPlus, IconTrash, IconUser } from "../../components/icons";
import {
  Avatar, Button, EmptyState, ErrorState, Field, LoadingState, Modal, PasswordField, Select, TextArea, toast,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { EMAIL_RE, fmtDate, fmtDateTime, isOnline, NICK_RE, normalizePhone, PHONE_RE } from "../../lib/format";
import { SITE_URL, supabase } from "../../lib/supabase";
import type { Gender, Profile as P } from "../../lib/types";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Links({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <div className="links">
      {links.map((l) => (
        <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className="chip"><IconLink /> {hostOf(l)}</a>
      ))}
    </div>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  if (!profile) return <LoadingState />;
  const name = profile.display_name || profile.nickname;

  return (
    <div className="page">
      <header className="page-head"><h1>{t("profile.title")}</h1></header>
      <div className="card profile-card">
        <div className="profile-top">
          <Avatar url={profile.avatar_url} name={name} size={88} />
          <div className="profile-names">
            <h2>{name}</h2>
            <span className="muted">@{profile.nickname}</span>
            <span className="muted small">{t("profile.memberSince", { date: fmtDate(profile.created_at) })}</span>
          </div>
        </div>
        {profile.bio && <p className="bio">{profile.bio}</p>}
        <Links links={profile.links ?? []} />
        <Button variant="secondary" block onClick={() => setEditing(true)}>{t("profile.edit")}</Button>
      </div>

      <div className="card">
        <div className="private-head"><IconLock /> <span className="muted small">{t("profile.onlyYou")}</span></div>
        <ul className="info-list">
          <li><IconMail /><span>{profile.email}</span>
            <button type="button" className="link-btn" onClick={() => setEmailOpen(true)}>{t("profile.changeEmail")}</button></li>
          {profile.new_email && <li className="muted small">{t("profile.pendingEmail", { email: profile.new_email })}</li>}
          <li><IconPhone /><span>{profile.phone || "—"}</span></li>
          <li><IconMapPin /><span>{profile.city || "—"}</span></li>
          <li><IconUser /><span>{t(`profile.${profile.gender}`)}</span></li>
        </ul>
      </div>

      {editing && <EditProfile profile={profile} onClose={() => setEditing(false)} />}
      {emailOpen && <ChangeEmail onClose={() => setEmailOpen(false)} />}
    </div>
  );
}

function EditProfile({ profile, onClose }: { profile: P; onClose: () => void }) {
  const { t } = useTranslation();
  const { patchProfile } = useAuth();
  const [f, setF] = useState({
    display_name: profile.display_name ?? "",
    nickname: profile.nickname,
    bio: profile.bio ?? "",
    gender: profile.gender,
    city: profile.city ?? "",
    phone: profile.phone ?? "",
    links: profile.links?.length ? [...profile.links] : [],
  });
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_url);
  const [crop, setCrop] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const phoneOk = !f.phone || PHONE_RE.test(normalizePhone(f.phone));
  const nickOk = NICK_RE.test(f.nickname.trim().toLowerCase());
  const linksOk = f.links.every((l) => !l.trim() || /^https?:\/\/\S{3,200}$/.test(l.trim()));

  async function uploadAvatar(blob: Blob) {
    setCrop(null);
    setBusy(true);
    const path = `${profile.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    setAvatar(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
  }

  async function save() {
    if (!phoneOk || !nickOk || !linksOk) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("update_my_profile", {
      p: {
        ...f,
        nickname: f.nickname.trim().toLowerCase(),
        phone: normalizePhone(f.phone),
        links: f.links.map((l) => l.trim()).filter(Boolean),
        avatar_url: avatar ?? "",
      },
    });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    patchProfile(data as P);
    onClose();
  }

  return (
    <>
      <Modal open title={t("profile.editTitle")} onClose={onClose} onDone={save} doneLoading={busy}
        doneDisabled={!phoneOk || !nickOk || !linksOk}>
        <div className="stack">
          <div className="avatar-edit">
            <Avatar url={avatar} name={f.display_name || f.nickname} size={88} />
            <div className="row gap-sm wrap">
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>{t("profile.changePhoto")}</Button>
              {avatar && <Button variant="ghost" onClick={() => setAvatar(null)}>{t("profile.removePhoto")}</Button>}
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={(e) => { const file = e.target.files?.[0]; if (file) setCrop(file); e.target.value = ""; }} />
          </div>
          <Field label={t("profile.displayName")} value={f.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} />
          <Field label={t("auth.nickname")} value={f.nickname} maxLength={24} autoCapitalize="off"
            onChange={(e) => set("nickname", e.target.value)} error={nickOk ? null : t("auth.nicknameInvalid")} />
          <TextArea label={t("profile.bio")} value={f.bio} maxLength={300} rows={3} onChange={(e) => set("bio", e.target.value)} />
          <Select label={t("profile.gender")} value={f.gender} onChange={(v) => set("gender", v as Gender)}
            options={(["unspecified", "female", "male"] as Gender[]).map((g) => ({ value: g, label: t(`profile.${g}`) }))} />
          <Field label={t("profile.city")} value={f.city} maxLength={60} onChange={(e) => set("city", e.target.value)} />
          <Field label={t("auth.phone")} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)}
            error={phoneOk ? null : t("errors.phone_invalid")} />
          <div className="field">
            <span className="field-label"><span>{t("profile.links")}</span></span>
            <div className="stack-sm">
              {f.links.map((l, i) => (
                <div key={i} className="field-control">
                  <input value={l} placeholder="https://" inputMode="url" aria-label={`${t("profile.links")} ${i + 1}`}
                    onChange={(e) => set("links", f.links.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button type="button" className="eye" aria-label={t("common.delete")}
                    onClick={() => set("links", f.links.filter((_, k) => k !== i))}><IconTrash /></button>
                </div>
              ))}
              {f.links.length < 5 && (
                <Button variant="ghost" onClick={() => set("links", [...f.links, ""])}><IconPlus /> {t("profile.addLink")}</Button>
              )}
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </Modal>
      {crop && <AvatarCropper file={crop} onCancel={() => setCrop(null)} onDone={uploadAvatar} />}
    </>
  );
}

function ChangeEmail({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) return setError(t("errors.email_invalid"));
    setBusy(true);
    setError(null);
    const { data: ok, error: e1 } = await supabase.rpc("verify_my_password", { p_password: password });
    if (e1 || !ok) {
      setBusy(false);
      return setError(e1 ? errorText(t, e1) : t("errors.wrong_password"));
    }
    const { error } = await supabase.auth.updateUser(
      { email: email.trim().toLowerCase() },
      { emailRedirectTo: `${SITE_URL}/confirm-email` },
    );
    setBusy(false);
    if (error) return setError(errorText(t, error));
    toast(t("profile.emailChangeSent", { email: email.trim() }));
    void refreshProfile();
    onClose();
  }

  return (
    <Modal open title={t("profile.changeEmail")} onClose={onClose} onDone={submit} doneLoading={busy}
      doneDisabled={!password || !email}>
      <div className="stack">
        <PasswordField label={t("profile.currentPassword")} value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)} />
        <Field label={t("profile.newEmail")} type="email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/** /u/:nickname — public fields only; online status respects the owner's setting (server-side). */
export function PublicProfile() {
  const { t } = useTranslation();
  const { nickname } = useParams();
  const [p, setP] = useState<(Pick<P, "id" | "nickname" | "display_name" | "avatar_url" | "bio" | "links" | "created_at" | "last_seen_at">) | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void supabase.rpc("public_profile", { p_nickname: nickname }).then(({ data, error }) => {
      if (error) setFailed(true);
      else setP(data ?? null);
    });
  }, [nickname]);

  if (failed) return <div className="page"><ErrorState /></div>;
  if (p === undefined) return <div className="page"><LoadingState /></div>;
  if (p === null) return <div className="page"><EmptyState text={t("pages.notFoundTitle")} /></div>;
  const name = p.display_name || p.nickname;
  return (
    <div className="page">
      <div className="card profile-card">
        <div className="profile-top">
          <Avatar url={p.avatar_url} name={name} size={88} />
          <div className="profile-names">
            <h2>{name}</h2>
            <span className="muted">@{p.nickname}</span>
            {p.last_seen_at && (
              <span className={`small ${isOnline(p.last_seen_at) ? "online" : "muted"}`}>
                {isOnline(p.last_seen_at) ? t("profile.online") : t("profile.lastSeen", { date: fmtDateTime(p.last_seen_at) })}
              </span>
            )}
          </div>
        </div>
        {p.bio && <p className="bio">{p.bio}</p>}
        <Links links={p.links ?? []} />
      </div>
    </div>
  );
}
