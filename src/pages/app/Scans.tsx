import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { Composer } from "../../components/Composer";
import { IconDoc } from "../../components/icons";
import { SCANS_CHANGED } from "../../components/Layout";
import { ScanResult } from "../../components/ScanResult";
import { Tour } from "../../components/Tour";
import { Spinner } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { ExtractError, extractText, MAX_CHARS, sha256Hex } from "../../lib/extract";
import { callFunction, supabase } from "../../lib/supabase";
import type { Scan } from "../../lib/types";

interface Turn {
  id: string;
  label: string; // file name or text snippet shown as the "user message"
  isFile: boolean;
  phase: "extracting" | "analyzing" | "done" | "error";
  scan?: Scan;
  error?: string;
}

export default function Scans() {
  const { t } = useTranslation();
  const { profile, patchProfile } = useAuth();
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = turns.some((x) => x.phase === "extracting" || x.phase === "analyzing");
  const showTour = Boolean(profile && (!profile.onboarded_at || params.get("tour") === "1"));

  // "New check" in the sidebar starts a fresh thread.
  const fresh = (loc.state as { fresh?: number } | null)?.fresh;
  useEffect(() => {
    if (fresh) setTurns([]);
  }, [fresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Admin decisions arrive live.
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`scans:${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scans", filter: `owner_id=eq.${profile.id}` },
        (p) => {
          const s = p.new as Scan;
          setTurns((list) => list.map((x) => (x.scan?.id === s.id ? { ...x, scan: { ...x.scan, ...s } } : x)));
        })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [profile]);

  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function classify(id: string, body: { text: string; file_name: string; file_type: string; file_size: number }) {
    if (!body.text.trim()) return update(id, { phase: "error", error: t("scan.empty_document") });
    if (body.text.length > MAX_CHARS) {
      return update(id, { phase: "error", error: t("scan.too_large", { max: MAX_CHARS.toLocaleString() }) });
    }
    update(id, { phase: "analyzing" });
    const sha256 = await sha256Hex(body.text);
    const { data } = await callFunction<{ scan?: Scan }>("classify", { ...body, sha256 });
    if (!data.scan) {
      const code = data.error ?? "generic";
      const known = ["too_large", "empty_document", "account_not_active"];
      return update(id, {
        phase: "error",
        error: known.includes(code) ? t(`scan.${code}`, { max: MAX_CHARS.toLocaleString() })
          : t(`errors.${code}`, { defaultValue: t("errors.generic") }),
      });
    }
    update(id, { phase: "done", scan: data.scan });
    window.dispatchEvent(new Event(SCANS_CHANGED));
  }

  function onText(text: string) {
    const id = crypto.randomUUID();
    const label = text.length > 280 ? `${text.slice(0, 280)}…` : text;
    setTurns((list) => [...list, { id, label, isFile: false, phase: "analyzing" }]);
    void classify(id, { text, file_name: "text.txt", file_type: "text/plain", file_size: text.length });
  }

  async function onFile(file: File) {
    const id = crypto.randomUUID();
    setTurns((list) => [...list, { id, label: file.name, isFile: true, phase: "extracting" }]);
    try {
      const content = await extractText(file);
      await classify(id, { text: content, file_name: file.name, file_type: file.type, file_size: file.size });
    } catch (e) {
      update(id, { phase: "error", error: e instanceof ExtractError ? t(`scan.${e.message}`) : t("scan.unsupported") });
    }
  }

  async function finishTour() {
    if (params.get("tour")) setParams({}, { replace: true });
    if (!profile?.onboarded_at) {
      patchProfile({ onboarded_at: new Date().toISOString() });
      await supabase.rpc("mark_onboarded");
    }
  }

  const composer = <Composer onText={onText} onFile={onFile} busy={busy} autoFocus />;

  return (
    <div className={`chat${turns.length ? "" : " empty"}`}>
      {turns.length === 0 ? (
        <div className="hero-center">
          <h1 className="hero-title">{t("scan.heroTitle")}</h1>
          {composer}
          <p className="composer-hint">{t("scan.formats")}</p>
        </div>
      ) : (
        <>
          <div className="thread">
            {turns.map((x) => (
              <div key={x.id} className="turn">
                <div className="bubble-user">
                  {x.isFile && <IconDoc />}
                  <span>{x.label}</span>
                </div>
                {(x.phase === "extracting" || x.phase === "analyzing") && (
                  <div className="thinking"><Spinner small /> {t(`scan.${x.phase}`)}</div>
                )}
                {x.phase === "error" && <p className="form-error" role="alert">{x.error}</p>}
                {x.scan && (
                  <ScanResult scan={x.scan} onChange={(s) => update(x.id, { scan: s })} />
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <div className="composer-dock">
            {composer}
            <p className="composer-hint">{t("scan.formats")}</p>
          </div>
        </>
      )}
      {showTour && <Tour onFinish={finishTour} />}
    </div>
  );
}
