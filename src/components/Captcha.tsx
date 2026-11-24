import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TURNSTILE_SITE_KEY } from "../lib/supabase";

export interface CaptchaHandle {
  reset: () => void;
}

/** Cloudflare Turnstile. Renders nothing when no site key is configured (local dev). */
export const Captcha = forwardRef<CaptchaHandle, { onToken: (t: string | null) => void }>(function Captcha(
  { onToken }, ref,
) {
  const { i18n } = useTranslation();
  const inst = useRef<TurnstileInstance>(null);
  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken(null);
      inst.current?.reset();
    },
  }));
  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="captcha">
      <Turnstile
        ref={inst}
        siteKey={TURNSTILE_SITE_KEY}
        options={{ language: i18n.language, theme: "auto", size: "flexible" }}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    </div>
  );
});

export const captchaRequired = () => Boolean(TURNSTILE_SITE_KEY);
