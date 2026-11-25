import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IconChevron, IconDoc } from "../../components/icons";
import { EmptyState, ErrorState, LevelBadge, LoadingState, ReviewBadge } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { ReviewStatus, Scan } from "../../lib/types";

const FILTERS: ("all" | ReviewStatus)[] = ["all", "pending", "confirmed"];

export default function History() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [items, setItems] = useState<Scan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | ReviewStatus>("all");

  const load = useCallback(async () => {
    setFailed(false);
    let q = supabase.from("scans").select("*").eq("owner_id", profile!.id).order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") q = q.eq("review_status", filter);
    const { data, error } = await q;
    if (error) return setFailed(true);
    setItems(data as Scan[]);
  }, [filter, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <header className="page-head"><h1>{t("nav.allHistory")}</h1></header>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`chip-btn${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? t("common.all") : t(`review.${f}`)}
          </button>
        ))}
      </div>
      {failed ? <ErrorState onRetry={load} />
        : items === null ? <LoadingState />
        : items.length === 0 ? <EmptyState icon={<IconDoc />} text={t("scan.noHistory")} />
        : (
          <ul className="list card">
            {items.map((s) => (
              <li key={s.id}>
                <Link to={`/app/scans/${s.id}`} className="list-row scan-row">
                  <div className="list-main">
                    <b className="truncate">{s.file_name}</b>
                    <span className="muted small">{fmtDateTime(s.created_at)}</span>
                  </div>
                  <div className="row gap-sm">
                    <ReviewBadge status={s.review_status} />
                    <LevelBadge level={s.final_level} />
                    <IconChevron className="muted" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
