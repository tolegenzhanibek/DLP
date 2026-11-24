import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, LoadingState, PasswordField, toast } from "../../components/ui";
import { errorText } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { AuthCard } from "./AuthCard";

export default function ResetPassword() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<"verifying" | "form" | "failed">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token_hash = params.get("token_hash");
    if (!token_hash) {
      void supabase.auth.getSession().then(({ data }) => setPhase(data.session ? "form" : "failed"));
      return;
    }
    void supabase.auth.verifyOtp({ token_hash, type: "recovery" }).then(({ error }) => {
      window.history.replaceState(null, "", "/reset-password");
      setPhase(error ? "failed" : "form");
    });
  }, [params]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError(t("errors.password_short"));
    if (password !== confirm) return setError(t("errors.password_mismatch"));
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorText(t, error));
    toast(t("auth.passwordUpdated"));
    nav("/app", { replace: true });
  }

  return (
    <AuthCard title={t("auth.resetTitle")} footer={<Link to="/login">{t("auth.toLogin")}</Link>}>
      {phase === "verifying" && <LoadingState />}
      {phase === "failed" && <p className="form-error" role="alert">{t("auth.confirmFailed")}</p>}
      {phase === "form" && (
        <form onSubmit={submit} noValidate className="stack">
          {/* New password and its confirmation share ONE eye toggle. */}
          <PasswordField label={t("auth.newPassword")} value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} visible={show} onToggle={() => setShow(!show)} />
          <PasswordField label={t("auth.passwordConfirm")} value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} visible={show} onToggle={() => setShow(!show)} showEye={false} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" block loading={busy}>{t("auth.setPassword")}</Button>
        </form>
      )}
    </AuthCard>
  );
}
