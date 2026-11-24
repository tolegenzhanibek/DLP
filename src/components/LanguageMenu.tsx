import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Lang } from "../i18n";
import { IconCheck, IconChevronDown, IconGlobe } from "./icons";

const NAMES: Record<Lang, string> = { kk: "Қазақша", ru: "Русский", en: "English" };

/** Compact language picker: globe + current language, opens a small menu. */
export function LanguageMenu() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = (LANGUAGES as readonly string[]).includes(i18n.language) ? (i18n.language as Lang) : "kk";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lang-menu" ref={ref}>
      <button type="button" className="lang-trigger" aria-haspopup="listbox" aria-expanded={open}
        aria-label="Language" onClick={() => setOpen(!open)}>
        <IconGlobe />
        <span className="lang-name">{NAMES[current]}</span>
        <span className="lang-code">{current.toUpperCase()}</span>
        <IconChevronDown className="lang-chevron" />
      </button>
      {open && (
        <ul className="lang-list" role="listbox" aria-label="Language">
          {LANGUAGES.map((l) => (
            <li key={l} role="option" aria-selected={l === current}>
              <button type="button" onClick={() => { setLanguage(l); setOpen(false); }}>
                <span>{NAMES[l]}</span>
                {l === current && <IconCheck />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
