import i18n from "../i18n";

const locale = () => ({ kk: "kk-KZ", ru: "ru-RU", en: "en-GB" })[i18n.language as "kk"] ?? "kk-KZ";
// Browsers render short Kazakh month names poorly ("М11"), so Kazakh uses numeric dates.
const numeric = () => i18n.language === "kk";

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(locale(), numeric()
    ? { day: "2-digit", month: "2-digit", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), numeric()
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const isOnline = (iso: string | null | undefined) =>
  Boolean(iso && Date.now() - new Date(iso).getTime() < 2 * 60_000);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[0-9]{10,15}$/;
export const NICK_RE = /^[a-z0-9_.]{3,24}$/;
export const normalizePhone = (s: string) => s.replace(/[^0-9+]/g, "");
