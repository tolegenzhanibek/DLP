import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import kk from "./locales/kk.json";
import ru from "./locales/ru.json";

export const LANGUAGES = ["kk", "ru", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];

const stored = (() => {
  try {
    return localStorage.getItem("lang");
  } catch {
    return null;
  }
})();
const browser = navigator.language.slice(0, 2);
const initial: Lang = (LANGUAGES as readonly string[]).includes(stored ?? "")
  ? (stored as Lang)
  : (LANGUAGES as readonly string[]).includes(browser)
  ? (browser as Lang)
  : "kk";

void i18n.use(initReactI18next).init({
  resources: { kk: { translation: kk }, ru: { translation: ru }, en: { translation: en } },
  lng: initial,
  fallbackLng: "kk",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem("lang", lang);
  } catch {
    /* storage may be unavailable */
  }
}
document.documentElement.lang = initial;

export default i18n;
