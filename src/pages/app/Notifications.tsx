import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IconBell } from "../../components/icons";
import { Button, EmptyState, ErrorState, LoadingState } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { AppNotification } from "../../lib/types";

export default function Notifications() {
  const { t } = useTranslation();
  const { profile, setUnread } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) return setFailed(true);
    setItems(data as AppNotification[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`notif-list:${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (p) => setItems((list) => (list ? [p.new as AppNotification, ...list] : list)))
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [profile]);

  async function markAll() {
    await supabase.rpc("mark_notifications_read", { p_ids: null });
    setItems((list) => list?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? list);
    setUnread(0);
  }

  async function open(n: AppNotification) {
    if (n.read_at) return;
    await supabase.rpc("mark_notifications_read", { p_ids: [n.id] });
    setUnread((c) => Math.max(0, c - 1));
  }

  const text = (n: AppNotification) => {
    const level = n.data.level ? t(`levels.${n.data.level}`) : "";
    const file = n.data.file_name ?? "";
    if (n.kind === "scan_resolved") return t(n.data.accepted ? "notifications.scan_resolved_accepted" : "notifications.scan_resolved_rejected", { file, level });
    return t(`notifications.${n.kind}`, { file, level });
  };
  const href = (n: AppNotification) =>
    n.kind === "dispute_new" ? "/admin?tab=reviews" : n.data.scan_id ? `/app/scans/${n.data.scan_id}` : "/app";

  const unread = items?.some((n) => !n.read_at);

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t("notifications.title")}</h1>
        {unread && <Button variant="ghost" onClick={markAll}>{t("notifications.markAll")}</Button>}
      </header>
      {failed ? <ErrorState onRetry={load} />
        : items === null ? <LoadingState />
        : items.length === 0 ? <EmptyState icon={<IconBell />} text={t("notifications.empty")} />
        : (
          <ul className="list card">
            {items.map((n) => (
              <li key={n.id}>
                <Link to={href(n)} className={`list-row${n.read_at ? "" : " unread"}`} onClick={() => void open(n)}>
                  <span className="dot" aria-hidden="true" />
                  <div className="list-main">
                    <span>{text(n)}</span>
                    <span className="muted small">{fmtDateTime(n.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
