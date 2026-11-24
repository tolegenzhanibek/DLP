import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ScanResult } from "../../components/ScanResult";
import { IconTrash } from "../../components/icons";
import { Button, EmptyState, ErrorState, LoadingState, toast } from "../../components/ui";
import { errorText } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import type { Scan } from "../../lib/types";

export default function ScanDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const [scan, setScan] = useState<Scan | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.from("scans").select("*").eq("id", id!).maybeSingle();
    if (error) return setFailed(true);
    setScan(data as Scan | null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!window.confirm(t("scan.deleteConfirm"))) return;
    const { error } = await supabase.rpc("delete_my_scan", { p_scan: id });
    if (error) return toast(errorText(t, error), "error");
    nav("/app", { replace: true });
  }

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/app" className="link-btn">← {t("scan.openAll")}</Link>
      </header>
      {failed ? <ErrorState onRetry={load} />
        : scan === undefined ? <LoadingState />
        : scan === null ? <EmptyState text={t("scan.notFound")} />
        : (
          <>
            <ScanResult scan={scan} onChange={setScan} />
            <Button variant="ghost" className="danger-text" onClick={remove}><IconTrash /> {t("scan.delete")}</Button>
          </>
        )}
    </div>
  );
}
