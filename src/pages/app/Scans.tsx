import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { IconChevron, IconDoc, IconUpload } from "../../components/icons";
import { ScanResult } from "../../components/ScanResult";
import { Tour } from "../../components/Tour";
import { Button, EmptyState, ErrorState, LevelBadge, LoadingState, ReviewBadge, Segmented } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { ExtractError, extractText, MAX_CHARS, sha256Hex } from "../../lib/extract";
import { fmtDateTime } from "../../lib/format";
import { callFunction, supabase } from "../../lib/supabase";
import type { ReviewStatus, Scan } from "../../lib/types";

type Phase = "idle" | "extracting" | "analyzing";
const FILTERS: ("all" | ReviewStatus)[] = ["all", "pending", "confirmed", "disputed", "rejected"];

export default function Scans() {
  const { t } = useTranslation();
  const { profile, patchProfile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Scan | null>(null);
  const [history, setHistory] = useState<Scan[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [filter, setFilter] = useState<"all" | ReviewStatus>("all");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const showTour = Boolean(profile && (!profile.onboarded_at || params.get("tour") === "1"));

  const load = useCallback(async () => {
    setHistoryError(false);
    let q = supabase.from("scans").select("*").eq("owner_id", profile!.id).order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") q = q.eq("review_status", filter);
    const { data, error } = await q;
    if (error) return setHistoryError(true);
    setHistory(data as Scan[]);
  }, [filter, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates of own scans (admin decisions arrive here).
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`scans:${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scans", filter: `owner_id=eq.${profile.id}` },
        (p) => {
          const s = p.new as Scan;
          setHistory((h) => h?.map((x) => (x.id === s.id ? { ...x, ...s } : x)) ?? h);
          setResult((r) => (r?.id === s.id ? { ...r, ...s } : r));
        })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [profile]);

  async function classify(body: { text: string; file_name: string; file_type: string; file_size: number }) {
    if (!body.text.trim()) return setError(t("scan.empty_document"));
    if (body.text.length > MAX_CHARS) return setError(t("scan.too_large", { max: MAX_CHARS.toLocaleString() }));
    setPhase("analyzing");
    const sha256 = await sha256Hex(body.text);
    const { data } = await callFunction<{ scan?: Scan; max_chars?: number }>("classify", { ...body, sha256 });
    setPhase("idle");
    if (!data.scan) {
      const code = data.error ?? "generic";
      const known = ["too_large", "empty_document", "account_not_active"];
      return setError(known.includes(code) ? t(`scan.${code}`, { max: MAX_CHARS.toLocaleString() })
        : t(`errors.${code}`, { defaultValue: t("errors.generic") }));
    }
    setResult(data.scan);
    setText("");
    setHistory((h) => (h ? [data.scan!, ...h] : h));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setPhase("extracting");
    try {
      const content = await extractText(file);
      await classify({ text: content, file_name: file.name, file_type: file.type, file_size: file.size });
    } catch (e) {
      setPhase("idle");
      setError(e instanceof ExtractError ? t(`scan.${e.message}`) : t("scan.unsupported"));
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void onFile(e.dataTransfer.files[0]);
  }

  async function finishTour() {
    if (params.get("tour")) setParams({}, { replace: true });
    if (!profile?.onboarded_at) {
      patchProfile({ onboarded_at: new Date().toISOString() });
      await supabase.rpc("mark_onboarded");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="page">
      <header className="page-head"><h1>{t("scan.title")}</h1></header>

      <div className="card upload" data-tour="upload">
        <Segmented label={t("scan.title")} value={mode} onChange={setMode}
          options={[{ value: "file", label: t("scan.fileTab") }, { value: "text", label: t("scan.textTab") }]} />
        {mode === "file" ? (
          <div className={`dropzone${drag ? " drag" : ""}${busy ? " busy" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            onClick={() => !busy && input.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}>
            <div className="dropzone-icon"><IconUpload /></div>
            <b>{busy ? t(`scan.${phase}`) : t("scan.dropTitle")}</b>
            <span className="muted small">{t("scan.formats")}</span>
            <input ref={input} type="file" hidden
              accept=".pdf,.docx,.txt,.csv,.md,.json,.log,.xml,.tsv,.yml,.yaml,text/*,application/pdf"
              onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="stack">
            <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} rows={8}
              placeholder={t("scan.pastePlaceholder")} aria-label={t("scan.pastePlaceholder")} disabled={busy} />
            <Button block loading={busy} disabled={!text.trim()}
              onClick={() => void classify({ text, file_name: "text.txt", file_type: "text/plain", file_size: text.length })}>
              {t("scan.analyze")}
            </Button>
          </div>
        )}
        {busy && <div className="progress" aria-hidden="true"><span /></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>

      {result && <ScanResult scan={result} onChange={(s) => {
        setResult(s);
        setHistory((h) => h?.map((x) => (x.id === s.id ? s : x)) ?? h);
      }} />}

      <section className="history" data-tour="history">
        <div className="section-head">
          <h2>{t("scan.history")}</h2>
        </div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`chip-btn${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? t("common.all") : t(`review.${f}`)}
            </button>
          ))}
        </div>
        {historyError ? <ErrorState onRetry={load} />
          : history === null ? <LoadingState />
          : history.length === 0 ? <EmptyState icon={<IconDoc />} text={t("scan.noHistory")} />
          : (
            <ul className="list card">
              {history.map((s) => (
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
      </section>

      {showTour && <Tour onFinish={finishTour} />}
    </div>
  );
}
