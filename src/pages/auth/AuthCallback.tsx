import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { LoadingState } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { AuthCard } from "./AuthCard";

/** Return point of Google/Microsoft sign-in. Reads the tokens from the URL fragment once and wipes them. */
export default function AuthCallback() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { refreshProfile } = useAuth();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    // Remove tokens from the address bar and history immediately.
    window.history.replaceState(null, "", "/auth/callback");

    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (hash.get("error") || query.get("error") || !access_token || !refresh_token) return setFailed(true);

    void supabase.auth.setSession({ access_token, refresh_token }).then(async ({ error }) => {
      if (error) return setFailed(true);
      await refreshProfile();
      nav("/app", { replace: true });
    });
  }, [nav, refreshProfile]);

  return (
    <AuthCard title={failed ? t("auth.oauthFailed") : t("auth.signingIn")}
      footer={<Link to="/login">{t("auth.toLogin")}</Link>}>
      {!failed && <LoadingState />}
    </AuthCard>
  );
}
