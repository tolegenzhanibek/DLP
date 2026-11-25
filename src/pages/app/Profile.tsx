import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { AvatarCropper } from "../../components/AvatarCropper";
import { PhotoViewer } from "../../components/PhotoViewer";
import { IconCamera } from "../../components/icons";
import {
  Avatar, Button, EmptyState, ErrorState, Field, LoadingState, Modal,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { fmtDate, fmtDateTime, isOnline } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Profile as P } from "../../lib/types";

/** Avatar with a camera badge: tap → pick → crop → upload. Returns the public URL. */
function AvatarPicker({ url, name, size, label, onUploaded, onError }: {
  url: string | null; name: string; size: number; label: string;
  onUploaded: (url: string) => void | Promise<void>; onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(blob: Blob) {
    setCrop(null);
    if (!profile) return;
    setBusy(true);
    const path = `${profile.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error) {
      setBusy(false);
      return onError(errorText(t, error));
    }
    await onUploaded(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    setBusy(false);
  }

  return (
    <>
      <button type="button" className={`avatar-picker${busy ? " busy" : ""}`} aria-label={label} disabled={busy}
        onClick={() => input.current?.click()}>
        <Avatar url={url} name={name} size={size} />
        <span className="avatar-cam" aria-hidden="true">{busy ? <span className="spinner spinner-sm" /> : <IconCamera />}</span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const file = e.target.files?.[0]; if (file) setCrop(file); e.target.value = ""; }} />
      {crop && <AvatarCropper file={crop} onCancel={() => setCrop(null)} onDone={upload} />}
    </>
  );
}

/** Avatar that opens the full-screen viewer when a photo is set. */
function AvatarView({ url, name, size }: { url: string | null; name: string; size: number }) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState(false);
  const close = useCallback(() => setViewing(false), []);
  if (!url) return <Avatar url={url} name={name} size={size} />;
  return (
    <>
      <button type="button" className="avatar-open" aria-label={t("profile.photo")} onClick={() => setViewing(true)}>
        <Avatar url={url} name={name} size={size} />
      </button>
      {viewing && <PhotoViewer url={url} onClose={close} />}
    </>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!profile) return <LoadingState />;
  const name = profile.display_name || profile.nickname;


  return (
    <div className="page">
      <header className="page-head"><h1>{t("profile.title")}</h1></header>
      <div className="card profile-card">
        <div className="profile-top">
          <AvatarView url={profile.avatar_url} name={name} size={88} />
          <div className="profile-names">
            <h2>{name}</h2>
            <span className="muted">@{profile.nickname}</span>
            <span className="muted small">{t("profile.memberSince", { date: fmtDate(profile.created_at) })}</span>
          </div>
        </div>
        <Button variant="secondary" block onClick={() => setEditing(true)}>{t("profile.edit")}</Button>
      </div>

      {editing && <EditProfile profile={profile} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditProfile({ profile, onClose }: { profile: P; onClose: () => void }) {
  const { t } = useTranslation();
  const { patchProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("update_my_profile", {
      p: { display_name: displayName, avatar_url: avatar ?? "" },
    });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    patchProfile(data as P);
    onClose();
  }

  return (
    <Modal open title={t("profile.editTitle")} onClose={onClose} onDone={save} doneLoading={busy}>
      <div className="stack">
        <div className="avatar-edit">
          <AvatarPicker url={avatar} name={displayName || profile.nickname} size={88} label={t("profile.changePhoto")}
            onUploaded={setAvatar} onError={setError} />
          {avatar && <button type="button" className="link-btn small" onClick={() => setAvatar(null)}>{t("profile.removePhoto")}</button>}
        </div>
        <Field label={t("profile.displayName")} value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        <Field label={t("auth.nickname")} value={`@${profile.nickname}`} readOnly disabled />
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/** /u/:nickname — public fields only; online status respects the owner's setting (server-side). */
export function PublicProfile() {
  const { t } = useTranslation();
  const { nickname } = useParams();
  const [p, setP] = useState<(Pick<P, "id" | "nickname" | "display_name" | "avatar_url" | "created_at" | "last_seen_at">) | null | undefined>(undefined);
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
          <AvatarView url={p.avatar_url} name={name} size={88} />
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
      </div>
    </div>
  );
}
