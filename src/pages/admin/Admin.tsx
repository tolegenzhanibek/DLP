import QRCode from "qrcode";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import { IconShield, IconUsers } from "../../components/icons";
import {
  Avatar, Button, EmptyState, ErrorState, Field, LevelBadge, LoadingState, Modal, ReviewBadge, Segmented, Select,
  TextArea, Toggle, toast,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { fmtDate, fmtDateTime, isOnline } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { LEVELS, type AccountStatus, type Finding, type Level, type ReviewStatus } from "../../lib/types";

type Tab = "overview" | "users" | "reviews" | "rules";

/** Admin area: requires role=admin AND a TOTP-verified session (aal2). The DB enforces the same. */
export default function Admin() {
  const { profile } = useAuth();
  const [aal, setAal] = useState<"checking" | "enroll" | "challenge" | "ok">("checking");

  const check = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === "aal2") return setAal("ok");
    setAal(data?.nextLevel === "aal2" ? "challenge" : "enroll");
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  if (profile?.role !== "admin") return <Navigate to="/app" replace />;
  if (aal === "checking") return <LoadingState />;
  if (aal !== "ok") return <MfaGate mode={aal} onVerified={() => setAal("ok")} />;
  return <AdminPanel />;
}

function MfaGate({ mode, onVerified }: { mode: "enroll" | "challenge"; onVerified: () => void }) {
  const { t } = useTranslation();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = list?.totp.find((f) => f.status === "verified");
      if (mode === "challenge" && verified) return setFactorId(verified.id);
      // Clean up half-finished enrolments, then enroll a fresh factor.
      for (const f of list?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Senim ${Date.now()}` });
      if (error || !data?.totp) return setError(errorText(t, error));
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setQr(await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 220 }));
    })();
  }, [mode, t]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return setError(t("admin.invalidCode"));
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setError(t("admin.invalidCode"));
    onVerified();
  }

  return (
    <div className="page narrow">
      <div className="card stack center">
        <div className="state-icon big"><IconShield /></div>
        <h1>{mode === "enroll" ? t("admin.enrollTitle") : t("admin.mfaTitle")}</h1>
        {mode === "enroll" && <p className="muted">{t("admin.enrollText")}</p>}
        {qr && <img src={qr} alt="QR" width={220} height={220} className="qr" />}
        {secret && <code className="secret">{t("admin.secret")}: {secret}</code>}
        <form onSubmit={verify} className="stack full">
          <Field label={t("admin.code")} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" block loading={busy} disabled={!factorId}>{t("admin.verify")}</Button>
        </form>
      </div>
    </div>
  );
}

function AdminPanel() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  return (
    <div className="page wide">
      <header className="page-head"><h1>{t("admin.title")}</h1></header>
      <Segmented<Tab> label={t("admin.title")} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={(["overview", "users", "reviews", "rules"] as Tab[]).map((v) => ({ value: v, label: t(`admin.${v}`) }))} />
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users />}
      {tab === "reviews" && <Reviews />}
      {tab === "rules" && <Rules />}
    </div>
  );
}

function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(args ?? {});
  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.rpc(fn, JSON.parse(key));
    if (error) return setFailed(true);
    setData(data as T);
  }, [fn, key]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, failed, load, setData };
}

function Overview() {
  const { t } = useTranslation();
  const { data, failed, load } = useRpc<Record<string, number> & {
    by_level: Partial<Record<Level, number>>; signups_14d: { day: string; n: number }[];
  }>("admin_stats");
  if (failed) return <ErrorState onRetry={load} />;
  if (!data) return <LoadingState />;
  const tiles: [string, number][] = [
    [t("admin.usersTotal"), data.users_total], [t("admin.usersNew7d"), data.users_new_7d],
    [t("admin.usersActive7d"), data.users_active_7d], [t("admin.scansTotal"), data.scans_total],
    [t("admin.scans7d"), data.scans_7d], [t("admin.disputesOpen"), data.disputes_open],
    [t("admin.usersBlocked"), data.users_blocked], [t("admin.aiUnavailable"), data.ai_unavailable],
  ];
  const max = Math.max(1, ...LEVELS.map((l) => data.by_level?.[l] ?? 0));
  const days = data.signups_14d ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="stack">
      <div className="tiles">
        {tiles.map(([label, n]) => <div key={label} className="card tile"><span className="muted small">{label}</span><b>{n}</b></div>)}
      </div>
      <div className="card">
        <h3>{t("admin.signups14d")}</h3>
        <div className="spark" role="img" aria-label={t("admin.signups14d")}>
          {days.map((d) => (
            <div key={d.day} className="spark-col" title={`${fmtDate(d.day)}: ${d.n}`}>
              <span className="spark-n">{d.n || ""}</span>
              <span className="spark-bar" style={{ height: `${(d.n / maxDay) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t("admin.byLevel")}</h3>
        <div className="bars">
          {LEVELS.map((l) => (
            <div key={l} className="bar-row">
              <LevelBadge level={l} />
              <div className="bar"><span className={`level-${l}`} style={{ width: `${((data.by_level?.[l] ?? 0) / max) * 100}%` }} /></div>
              <b>{data.by_level?.[l] ?? 0}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface UserRow {
  id: string; nickname: string; display_name: string | null; avatar_url: string | null; email: string | null;
  phone: string | null; city: string | null; role: "user" | "admin"; status: AccountStatus; blocked_reason: string | null;
  created_at: string; last_seen_at: string | null; scans_count: number;
}

function Users() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | AccountStatus>("");
  const { data, failed, load } = useRpc<UserRow[]>("admin_list_users", { p_search: q || null, p_status: status || null });
  const [blocking, setBlocking] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  async function setUserStatus(u: UserRow, s: AccountStatus, r?: string) {
    setBusy(u.id);
    const { error } = await supabase.rpc("admin_set_user_status", { p_user: u.id, p_status: s, p_reason: r ?? null });
    setBusy(null);
    if (error) return toast(errorText(t, error), "error");
    setBlocking(null);
    setReason("");
    void load();
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <Field label={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label={t("admin.users")} value={status} onChange={(v) => setStatus(v as "" | AccountStatus)}
          options={[{ value: "", label: t("common.all") }, { value: "active", label: t("admin.usersActive") },
            { value: "blocked", label: t("admin.usersBlocked") }]} />
      </div>
      {failed ? <ErrorState onRetry={load} /> : !data ? <LoadingState /> : data.length === 0
        ? <EmptyState icon={<IconUsers />} text={t("admin.noUsers")} /> : (
          <ul className="list card">
            {data.map((u) => (
              <li key={u.id} className="list-row static user-row">
                <span className="avatar-wrap">
                  <Avatar url={u.avatar_url} name={u.display_name || u.nickname} />
                  {isOnline(u.last_seen_at) && <span className="online-dot" />}
                </span>
                <div className="list-main">
                  <b className="truncate">{u.display_name || u.nickname} <span className="muted">@{u.nickname}</span>
                    {u.role === "admin" && <span className="chip tiny">{t("admin.role_admin")}</span>}</b>
                  <span className="muted small truncate">{u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
                  <span className="muted small">{fmtDate(u.created_at)} · {t("admin.scansCount", { count: u.scans_count })}
                    {u.status === "blocked" && u.blocked_reason ? ` · ${u.blocked_reason}` : ""}</span>
                </div>
                {u.role !== "admin" && (
                  <div className="row gap-sm wrap end">
                    {u.status === "blocked"
                      ? <Button variant="secondary" loading={busy === u.id} onClick={() => setUserStatus(u, "active")}>{t("admin.unblock")}</Button>
                      : <Button variant="ghost" className="danger-text" onClick={() => setBlocking(u)}>{t("admin.block")}</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      <Modal open={Boolean(blocking)} title={t("admin.block")} onClose={() => setBlocking(null)} doneLabel={t("admin.block")}
        onDone={() => blocking && setUserStatus(blocking, "blocked", reason)} doneLoading={Boolean(busy)}>
        <TextArea label={t("admin.blockReason")} value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}

interface ScanRow {
  id: string; owner_nickname: string; file_name: string; final_level: Level; rule_level: Level; ai_level: Level | null;
  ai_status: string; review_status: ReviewStatus; user_suggested_level: Level | null; user_comment: string | null;
  categories: string[]; findings: Finding[]; summary: string | null; created_at: string;
}

function Reviews() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReviewStatus>("disputed");
  const { data, failed, load } = useRpc<ScanRow[]>("admin_list_scans", { p_status: status });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(s: ScanRow, accept: boolean) {
    setBusy(s.id);
    const { error } = await supabase.rpc("admin_resolve_scan", { p_scan: s.id, p_accept: accept, p_comment: comments[s.id] ?? null });
    setBusy(null);
    if (error) return toast(errorText(t, error), "error");
    void load();
  }

  return (
    <div className="stack">
      <div className="filters">
        {(["disputed", "pending", "confirmed", "rejected"] as ReviewStatus[]).map((f) => (
          <button key={f} type="button" className={`chip-btn${status === f ? " active" : ""}`} onClick={() => setStatus(f)}>
            {t(`review.${f}`)}
          </button>
        ))}
      </div>
      {failed ? <ErrorState onRetry={load} /> : !data ? <LoadingState /> : data.length === 0
        ? <EmptyState text={t("admin.noDisputes")} /> : data.map((s) => (
          <div key={s.id} className="card stack review-card">
            <div className="result-head">
              <div className="result-title">
                <h3 className="truncate">{s.file_name}</h3>
                <span className="muted small">@{s.owner_nickname} · {fmtDateTime(s.created_at)}</span>
              </div>
              <ReviewBadge status={s.review_status} />
            </div>
            <div className="row gap-sm wrap">
              <LevelBadge level={s.final_level} />
              {s.user_suggested_level && <>→ <LevelBadge level={s.user_suggested_level} /></>}
            </div>
            <span className="muted small">{t("scan.ruleLevel")}: {t(`levels.${s.rule_level}`)}
              {s.ai_level ? ` · ${t("scan.aiLevel")}: ${t(`levels.${s.ai_level}`)}` : ""}</span>
            {s.summary && <p>{s.summary}</p>}
            {s.findings.length > 0 && (
              <div className="chips">
                {s.findings.map((f, i) => <span key={i} className="chip">{t(`findingTypes.${f.type}`, { rule: f.rule ?? "" })} ×{f.count}</span>)}
              </div>
            )}
            {s.user_comment && <p className="note">“{s.user_comment}”</p>}
            {s.review_status === "disputed" && (
              <>
                <TextArea label={t("admin.comment")} rows={2} maxLength={500} value={comments[s.id] ?? ""}
                  onChange={(e) => setComments({ ...comments, [s.id]: e.target.value })} />
                <div className="row gap-sm">
                  <Button loading={busy === s.id} onClick={() => resolve(s, true)}>{t("admin.accept")}</Button>
                  <Button variant="secondary" disabled={busy === s.id} onClick={() => resolve(s, false)}>{t("admin.reject")}</Button>
                </div>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

interface Rule { id: string; name: string; keywords: string[]; level: Level; enabled: boolean }

function Rules() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<Partial<Rule> & { kw?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.from("policy_rules").select("id,name,keywords,level,enabled").order("created_at");
    if (error) return setFailed(true);
    setRules(data as Rule[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const keywords = (edit.kw ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    const { error } = await supabase.rpc("admin_upsert_rule", {
      p: { id: edit.id ?? null, name: edit.name, keywords, level: edit.level ?? "confidential", enabled: edit.enabled ?? true },
    });
    setBusy(false);
    if (error) return toast(errorText(t, error), "error");
    setEdit(null);
    void load();
  }

  async function toggle(r: Rule, enabled: boolean) {
    const { error } = await supabase.rpc("admin_upsert_rule", { p: { ...r, enabled } });
    if (error) return toast(errorText(t, error), "error");
    setRules((rs) => rs?.map((x) => (x.id === r.id ? { ...x, enabled } : x)) ?? rs);
  }

  async function remove(r: Rule) {
    if (!window.confirm(t("admin.deleteRule"))) return;
    const { error } = await supabase.rpc("admin_delete_rule", { p_rule: r.id });
    if (error) return toast(errorText(t, error), "error");
    setEdit(null);
    void load();
  }

  return (
    <div className="stack">
      <div className="row end">
        <Button onClick={() => setEdit({ name: "", kw: "", level: "confidential", enabled: true })}>{t("admin.addRule")}</Button>
      </div>
      {failed ? <ErrorState onRetry={load} /> : !rules ? <LoadingState /> : rules.length === 0
        ? <EmptyState text={t("admin.noRules")} /> : (
          <ul className="list card">
            {rules.map((r) => (
              <li key={r.id} className="list-row static">
                <button type="button" className="list-main plain" onClick={() => setEdit({ ...r, kw: r.keywords.join(", ") })}>
                  <b>{r.name}</b>
                  <span className="muted small truncate">{r.keywords.join(", ")}</span>
                </button>
                <div className="row gap-sm">
                  <LevelBadge level={r.level} />
                  <Toggle label={t("admin.enabled")} checked={r.enabled} onChange={(v) => toggle(r, v)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      <Modal open={Boolean(edit)} title={edit?.id ? edit.name ?? "" : t("admin.addRule")} onClose={() => setEdit(null)}
        onDone={save} doneLoading={busy} doneDisabled={!edit?.name?.trim() || !edit?.kw?.trim()}>
        {edit && (
          <div className="stack">
            <Field label={t("admin.ruleName")} value={edit.name ?? ""} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextArea label={t("admin.keywords")} value={edit.kw ?? ""} rows={3} onChange={(e) => setEdit({ ...edit, kw: e.target.value })} />
            <Select label={t("admin.level")} value={edit.level ?? "confidential"} onChange={(v) => setEdit({ ...edit, level: v as Level })}
              options={LEVELS.map((l) => ({ value: l, label: t(`levels.${l}`) }))} />
            {edit.id && <Button variant="ghost" className="danger-text" onClick={() => remove(edit as Rule)}>{t("common.delete")}</Button>}
          </div>
        )}
      </Modal>
    </div>
  );
}
