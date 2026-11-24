import type { EmailOtpType } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoadingState } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { AuthCard } from "./AuthCard";

const TYPES: EmailOtpType[] = ["signup", "email_change", "email", "invite", "magiclink"];

/** Opened from the button in the email: verifies token_hash and signs the user in. */
export default function ConfirmEmail() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token_hash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    if (!token_hash || !type || !TYPES.includes(type)) return setFailed(true);
    void supabase.auth.verifyOtp({ token_hash, type }).then(async ({ error }) => {
      if (error) return setFailed(true);
      await refreshProfile();
      nav(type === "email_change" ? "/profile" : "/app", { replace: true });
    });
  }, [params, nav, refreshProfile]);

  return (
    <AuthCard title={failed ? t("auth.confirmFailed") : t("auth.confirming")}
      footer={<Link to="/login">{t("auth.toLogin")}</Link>}>
      {!failed && <LoadingState />}
    </AuthCard>
  );
}
