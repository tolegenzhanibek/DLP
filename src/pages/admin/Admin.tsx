import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Donut, TimeChart, type Point } from "../../components/charts";
import { IconUsers } from "../../components/icons";
import {
  Avatar, Button, EmptyState, ErrorState, Field, LevelBadge, LoadingState, Modal, Segmented, Select, TextArea, toast,
} from "../../components/ui";
import i18n from "../../i18n";
import { useAuth } from "../../lib/auth";
import { errorText } from "../../lib/errors";
import { fmtDate, isOnline } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { LEVELS, type AccountStatus, type Level } from "../../lib/types";

/** Admin area (analytics only): /admin = overview, /admin/users = users. Role is enforced in the DB too. */
export default function Admin({ page }: { page: "overview" | "users" }) {
  const { profile } = useAuth();
  if (profile?.role !== "admin") return <Navigate to="/app" replace />;
  return page === "users" ? <Users /> : <Overview />;
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

interface Day { day: string; signups: number; scans: number; active: number }
interface Stats {
  days: number; users_total: number; users_new_7d: number; users_active_7d: number; users_blocked: number;
  scans_total: number; scans_7d: number; ai_unavailable: number;
  by_level: Partial<Record<Level, number>>; daily: Day[];
}
type Range = "7" | "14" | "30";

const shortDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return i18n.language === "kk"
    ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
    : new Intl.DateTimeFormat(i18n.language === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short" }).format(d);
};

function Overview() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>(() => {
    try {
      return (localStorage.getItem("admin-range") as Range) || "14";
    } catch {
      return "14";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("admin-range", range);
    } catch {
      /* ignore */
    }
  }, [range]);
  const { data, failed, load } = useRpc<Stats>("admin_stats", { p_days: Number(range) });

  const series = (k: "signups" | "scans" | "active"): Point[] =>
    (data?.daily ?? []).map((d) => ({ label: shortDay(d.day), full: fmtDate(d.day), value: d[k] }));
  const sum = (k: "signups" | "scans" | "active") => (data?.daily ?? []).reduce((s, d) => s + d[k], 0);
  const levelTotal = LEVELS.reduce((s, l) => s + (data?.by_level?.[l] ?? 0), 0);

  return (
    <div className="page wide">
      <header className="page-head">
        <h1>{t("admin.overview")}</h1>
        <Segmented<Range> label={t("admin.period")} value={range} onChange={setRange}
          options={(["7", "14", "30"] as Range[]).map((v) => ({ value: v, label: t("admin.days", { count: Number(v) }) }))} />
      </header>
      {failed ? <ErrorState onRetry={load} /> : !data ? <LoadingState /> : (
        <div className="stack">
          <div className="tiles">
            {([
              [t("admin.usersTotal"), data.users_total], [t("admin.usersNew7d"), data.users_new_7d],
              [t("admin.usersActive7d"), data.users_active_7d], [t("admin.scansTotal"), data.scans_total],
              [t("admin.scans7d"), data.scans_7d], [t("admin.usersBlocked"), data.users_blocked],
            ] as [string, number][]).map(([label, n]) => (
              <div key={label} className="card tile"><span className="muted small">{label}</span><b>{n}</b></div>
            ))}
          </div>
          <div className="chart-grid-2">
            <section className="card chart-card">
              <div className="chart-head"><h3>{t("admin.chartSignups")}</h3><b>{sum("signups")}</b></div>
              <TimeChart data={series("signups")} label={t("admin.chartSignups")} unit={(n) => t("admin.nUsers", { count: n })} />
            </section>
            <section className="card chart-card">
              <div className="chart-head"><h3>{t("admin.chartActive")}</h3></div>
              <TimeChart kind="line" data={series("active")} label={t("admin.chartActive")} unit={(n) => t("admin.nUsers", { count: n })} />
            </section>
            <section className="card chart-card">
              <div className="chart-head"><h3>{t("admin.chartScans")}</h3><b>{sum("scans")}</b></div>
              <TimeChart data={series("scans")} label={t("admin.chartScans")} unit={(n) => t("admin.scansCount", { count: n })} />
            </section>
            <section className="card chart-card">
              <div className="chart-head"><h3>{t("admin.byLevel")}</h3></div>
              <Donut label={t("admin.byLevel")}
                center={<><b>{levelTotal}</b><span className="muted small">{t("admin.inPeriod")}</span></>}
                slices={LEVELS.map((l) => ({
                  key: l, label: <LevelBadge level={l} />, text: t(`levels.${l}`), value: data.by_level?.[l] ?? 0, color: `var(--lvc-${l})`,
                }))} />
            </section>
          </div>
          {data.ai_unavailable > 0 && <p className="muted small">{t("admin.aiUnavailable")}: {data.ai_unavailable}</p>}
        </div>
      )}
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
    <div className="page wide">
      <header className="page-head"><h1>{t("admin.users")}</h1></header>
      <div className="toolbar">
        <Field label={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label={t("admin.statusFilter")} value={status} onChange={(v) => setStatus(v as "" | AccountStatus)}
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
