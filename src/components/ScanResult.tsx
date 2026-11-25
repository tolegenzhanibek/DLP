import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { LEVELS, type Scan } from "../lib/types";
import { fmtDateTime } from "../lib/format";
import { Button, LevelBadge, ReviewBadge, toast } from "./ui";

export function ScanResult({ scan, onChange }: { scan: Scan; onChange: (s: Scan) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const { data, error } = await supabase.rpc("confirm_scan", { p_scan: scan.id });
    setBusy(false);
    if (error) return toast(errorText(t, error), "error");
    onChange(data as Scan);
  }

  const aiNote = scan.ai_status !== "ok" ? t(`scan.ai_${scan.ai_status}`) : null;

  return (
    <div className="card result" data-level={scan.final_level}>
      <div className="result-head">
        <div className="result-title">
          <h2 title={scan.file_name}>{scan.file_name}</h2>
          <span className="muted small">{fmtDateTime(scan.created_at)} · {t("scan.chars", { count: scan.char_count })}</span>
        </div>
        <ReviewBadge status={scan.review_status} />
      </div>

      <div className="result-level">
        <LevelBadge level={scan.final_level} large />
        <div className="result-meta">
          <span>{t("scan.ruleLevel")}: <b>{t(`levels.${scan.rule_level}`)}</b></span>
          {scan.ai_level && <span>{t("scan.aiLevel")}: <b>{t(`levels.${scan.ai_level}`)}</b></span>}
          {scan.ai_confidence != null && (
            <span>{t("scan.confidence")}: <b>{Math.round(scan.ai_confidence * 100)}%</b></span>
          )}
        </div>
      </div>
      <div className="meter" aria-hidden="true">
        {LEVELS.map((l) => <span key={l} className={LEVELS.indexOf(l) <= LEVELS.indexOf(scan.final_level) ? `on level-${scan.final_level}` : ""} />)}
      </div>

      {aiNote && <p className="note">{aiNote}</p>}

      {scan.summary && (
        <section>
          <h3>{t("scan.summary")}</h3>
          <p>{scan.summary}</p>
        </section>
      )}
      {scan.rationale && (
        <section>
          <h3>{t("scan.rationale")}</h3>
          <p className="muted">{scan.rationale}</p>
        </section>
      )}

      {scan.categories.length > 0 && (
        <section>
          <h3>{t("scan.categories")}</h3>
          <div className="chips">
            {scan.categories.map((c) => <span key={c} className="chip">{t(`categories.${c}`, { defaultValue: c })}</span>)}
          </div>
        </section>
      )}

      <section>
        <h3>{t("scan.findings")}</h3>
        {scan.findings.length === 0 ? (
          <p className="muted">{t("scan.noFindings")}</p>
        ) : (
          <ul className="findings">
            {scan.findings.map((f, i) => (
              <li key={`${f.type}-${f.rule ?? ""}-${i}`}>
                <div>
                  <b>{t(`findingTypes.${f.type}`, { rule: f.rule ?? "" })}</b>
                  {f.samples.length > 0 && <code>{f.samples.join("  ")}</code>}
                </div>
                <div className="row gap-sm">
                  <span className="count">×{f.count}</span>
                  <LevelBadge level={f.level} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {scan.review_status === "pending" && (
        <div className="row gap-sm actions">
          <Button onClick={confirm} loading={busy}>{t("scan.confirm")}</Button>
        </div>
      )}
    </div>
  );
}
