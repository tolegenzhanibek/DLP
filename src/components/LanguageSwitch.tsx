import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Lang } from "../i18n";

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={i18n.language === l}
          className={i18n.language === l ? "active" : ""} onClick={() => setLanguage(l as Lang)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
