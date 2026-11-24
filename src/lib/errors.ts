import type { TFunction } from "i18next";

const KNOWN = new Set([
  "invalid_credentials", "email_not_confirmed", "captcha_failed", "rate_limited", "weak_password",
  "network", "nickname_taken", "wrong_password", "same_password",
]);

/** Maps Supabase / edge-function errors to a translated, user-safe message. */
export function errorText(t: TFunction, err: unknown): string {
  const e = err as { code?: string; message?: string; error?: string; status?: number } | string | null;
  const code = typeof e === "string" ? e : e?.code ?? e?.error ?? "";
  const msg = typeof e === "string" ? "" : e?.message ?? "";
  if (KNOWN.has(code)) return t(`errors.${code}`);
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || /P0429|rate_limited/.test(msg))
    return t("errors.rate_limited");
  if (code.startsWith("captcha")) return t("errors.captcha_failed");
  if (code === "weak_password" || /pwned|leaked/i.test(msg)) return t("errors.weak_password");
  if (code === "same_password") return t("errors.same_password");
  if (/nickname_taken|duplicate/.test(msg)) return t("errors.nickname_taken");
  if (/Failed to fetch|NetworkError/.test(msg)) return t("errors.network");
  return t("errors.generic");
}
